-- La reprise de portefeuille COMPTABLE : rendre utilisables deux tables qui ne
-- l'étaient pas.
--
-- CE QUI EXISTAIT, ET POURQUOI PERSONNE NE S'EN SERVAIT. `reprises_portefeuille`
-- et `reprise_soldes` sont nées le 03/09 avec leurs colonnes, leur RLS activée
-- — et AUCUNE politique. Une table dont la RLS est active et qui n'a pas de
-- politique n'est lisible par personne : ces deux-là étaient des coquilles,
-- fermées à double tour. Aucune ligne de code ne les a jamais touchées. Une
-- agence qui bascule en cours d'exercice ressaisit donc ses soldes à la main :
-- dépôts de garantie détenus, avances des locataires, fonds mandants.
--
-- CE QUE LA REPRISE EST. Une balance d'ouverture : ce que l'agence détient au
-- jour de la bascule, ligne à ligne, rapproché du total qu'elle annonce
-- reprendre. « Écart zéro exigé avant bascule » (module 16) se lit ainsi : la
-- somme des lignes de trésorerie doit égaler le total annoncé. Si l'agence dit
-- reprendre 42 000 € et que le détail en fait 41 600, il manque 400 € à
-- quelqu'un — et on ne bascule pas un portefeuille sur un compte qui ne tombe
-- pas juste.
--
-- DEUX PASSES, comme l'import du parc. Le contrôle n'écrit rien et rend, ligne
-- par ligne, ce qui passera ; la bascule n'est possible qu'ensuite. On ne fait
-- pas basculer les comptes d'un parc sur un fichier que personne n'a regardé.
--
-- CE QUE LA BASCULE N'APPLIQUE PAS, ET LE DIT. Une DETTE de locataire
-- (solde négatif) n'est pas écrite : elle serait un appel de loyer pour une
-- période que Gerimmo n'a pas connue, qui polluerait l'échéancier et
-- déclencherait des quittances fausses. Elle est enregistrée, signalée, et
-- reste à traiter dans le parcours de relance. Mieux vaut une dette visible
-- hors du compte qu'une écriture inventée dedans.

-- ── Les deux tables deviennent des tables d'organisation à part entière ────
alter table public.reprises_portefeuille
  alter column organization_id set not null;
alter table public.reprises_portefeuille
  add constraint reprises_portefeuille_id_org_unique unique (id, organization_id);
alter table public.reprises_portefeuille
  add column if not exists tresorerie_annoncee numeric(12,2),
  add column if not exists basculee_le timestamptz,
  add column if not exists basculee_par uuid references public.accounts (id);
comment on column public.reprises_portefeuille.tresorerie_annoncee is
  'Le total que l''agence déclare reprendre. La bascule exige qu''il égale la somme des lignes de trésorerie — c''est l''écart zéro.';

-- `reprise_soldes` n'avait pas d'organisation : elle ne pouvait donc ni être
-- gardée par l'abonnement, ni être lue sans traverser sa reprise.
alter table public.reprise_soldes
  add column if not exists organization_id uuid references public.organizations (id);
update public.reprise_soldes s
   set organization_id = r.organization_id
  from public.reprises_portefeuille r
 where r.id = s.reprise_id and s.organization_id is null;
alter table public.reprise_soldes
  alter column organization_id set not null;
alter table public.reprise_soldes
  add constraint reprise_soldes_reprise_meme_org_fk
  foreign key (reprise_id, organization_id)
  references public.reprises_portefeuille (id, organization_id) on delete cascade;
alter table public.reprise_soldes
  add constraint reprise_soldes_type_connu
  check (type in ('solde_locataire', 'depot_garantie', 'provision_charges', 'fonds_mandant'));
alter table public.reprise_soldes
  add column if not exists reference text;
create index if not exists reprise_soldes_reprise_idx on public.reprise_soldes (reprise_id);

-- ── Qui voit quoi ─────────────────────────────────────────────────────────
-- Une balance d'ouverture engage tout le portefeuille : elle est réservée au
-- responsable de l'organisation, comme l'import du parc. L'agent la lit (il
-- travaille sur les mêmes baux) mais ne la crée pas.
create policy reprises_select on public.reprises_portefeuille for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
create policy reprise_soldes_select on public.reprise_soldes for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
-- Les DROITS DE TABLE, sans lesquels une politique ne sert à rien : c'est la
-- seconde moitié de la raison pour laquelle ces tables étaient inertes. En
-- lecture seule — l'écriture passe par les fonctions ci-dessous, jamais en
-- direct, car c'est le contrôle d'écart zéro qui donne son sens à la bascule et
-- une insertion directe le contournerait.
grant select on public.reprises_portefeuille, public.reprise_soldes to authenticated;

-- Le compte mandant reçoit désormais de vraies lignes (la bascule y écrit) :
-- il doit donc être lisible par ceux dont c'est l'argent à rendre. Lui aussi
-- était né le 03/09 sans politique ni droit.
create policy mouvements_mandants_select on public.mouvements_mandants for select
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
grant select on public.mouvements_mandants to authenticated;

-- ── Ouvrir une reprise ────────────────────────────────────────────────────
create or replace function public.ouvrir_reprise(
  p_org uuid,
  p_date_bascule date,
  p_tresorerie numeric,
  p_source text default 'fichier'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  -- Même garde que l'import du parc : une balance d'ouverture engage tout le
  -- portefeuille.
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'ouvrir_reprise: reserve au responsable de l''organisation';
  end if;
  if not public.org_ecriture_ouverte(p_org) then
    raise exception 'ouvrir_reprise: organisation en lecture seule';
  end if;
  if p_date_bascule is null then
    raise exception 'ouvrir_reprise: la date de bascule est obligatoire';
  end if;

  -- Une seule reprise ouverte à la fois : deux balances d'ouverture
  -- concurrentes sur le même parc, c'est un double comptage assuré.
  if exists (select 1 from public.reprises_portefeuille
              where organization_id = p_org and statut in ('en_cours','controle')) then
    raise exception 'ouvrir_reprise: une reprise est deja en cours pour cette organisation';
  end if;

  insert into public.reprises_portefeuille
    (organization_id, source, date_bascule, tresorerie_annoncee, statut)
  values (p_org, p_source, p_date_bascule, p_tresorerie, 'en_cours')
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.ouvrir_reprise(uuid, date, numeric, text) from public, anon;

-- ── Contrôler, puis basculer ──────────────────────────────────────────────
-- Une seule fonction pour les deux passes : le contrôle est la bascule qui
-- n'écrit pas. Écrites séparément, elles auraient fini par diverger — et le
-- jour où le contrôle dit « tout passe » alors que la bascule refuse, plus
-- personne ne fait confiance au contrôle.
create or replace function public.reprendre_soldes(
  p_org uuid,
  p_reprise uuid,
  p_lignes jsonb,
  p_controle_seulement boolean default true
)
returns table (
  ligne integer,
  statut text,
  message text,
  type text,
  montant numeric,
  tresorerie boolean,
  bail_id uuid,
  person_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reprise record;
  v_ligne jsonb;
  v_i integer := 0;
  v_type text;
  v_montant numeric;
  v_detenteur text;
  v_bail uuid;
  v_person uuid;
  v_msg text;
  v_statut text;
  v_tresorerie boolean;
  v_somme numeric := 0;
  v_ecart numeric;
  v_bloquantes integer := 0;
  v_depot_bail numeric;
  v_deja numeric;
begin
  -- Même garde que l'import du parc : une balance d'ouverture engage tout le
  -- portefeuille.
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'reprendre_soldes: reserve au responsable de l''organisation';
  end if;
  if not public.org_ecriture_ouverte(p_org) then
    raise exception 'reprendre_soldes: organisation en lecture seule';
  end if;

  select * into v_reprise from public.reprises_portefeuille
   where id = p_reprise and organization_id = p_org;
  if v_reprise.id is null then
    raise exception 'reprendre_soldes: reprise introuvable';
  end if;
  -- Une bascule ne se rejoue pas : elle est définitive, et les corrections
  -- passent ensuite par des écritures rectificatives (commentaire de la table).
  if v_reprise.statut = 'basculee' then
    raise exception 'reprendre_soldes: cette reprise est deja basculee';
  end if;
  if v_reprise.statut = 'abandonnee' then
    raise exception 'reprendre_soldes: cette reprise est abandonnee';
  end if;

  -- Première boucle : on juge chaque ligne, sans rien écrire.
  create temporary table if not exists tmp_reprise (
    ligne integer, statut text, message text, type text, montant numeric,
    tresorerie boolean, bail_id uuid, person_id uuid, detenteur text
  ) on commit drop;
  delete from tmp_reprise;

  for v_ligne in select * from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb))
  loop
    v_i := v_i + 1;
    v_statut := 'ok'; v_msg := ''; v_bail := null; v_person := null;
    v_tresorerie := false;

    v_type := lower(btrim(coalesce(v_ligne->>'type', '')));
    v_detenteur := nullif(lower(btrim(coalesce(v_ligne->>'detenteur', ''))), '');
    -- La virgule décimale du tableur français, et l'espace des milliers.
    v_montant := nullif(replace(replace(btrim(coalesce(v_ligne->>'montant','')),
                                        ' ', ''), ',', '.'), '')::numeric;

    if v_type not in ('solde_locataire','depot_garantie','provision_charges','fonds_mandant') then
      v_statut := 'erreur';
      v_msg := format('Type inconnu « %s » — attendus : depot_garantie, solde_locataire, provision_charges, fonds_mandant.',
                      coalesce(nullif(v_type,''), '(vide)'));
    elsif v_montant is null then
      v_statut := 'erreur';
      v_msg := 'Montant absent ou illisible.';
    else
      -- Rattachement : un bail pour ce qui concerne un locataire, une personne
      -- pour ce qui appartient à un propriétaire.
      if v_type in ('depot_garantie','solde_locataire','provision_charges') then
        select b.id into v_bail
          from public.baux b
          join public.lots l on l.id = b.lot_id
          join public.biens bi on bi.id = l.bien_id
          left join public.persons p on p.id = b.locataire_principal
         where b.organization_id = p_org
           and b.etat in ('actif','preavis')
           and (
             (nullif(btrim(coalesce(v_ligne->>'locataire_email','')), '') is not null
              and lower(p.email) = lower(btrim(v_ligne->>'locataire_email')))
             or (nullif(btrim(coalesce(v_ligne->>'lot','')), '') is not null
                 and lower(l.nom) = lower(btrim(v_ligne->>'lot'))
                 and (nullif(btrim(coalesce(v_ligne->>'bien','')), '') is null
                      or lower(bi.nom) = lower(btrim(v_ligne->>'bien'))))
           )
         limit 1;
        if v_bail is null then
          v_statut := 'erreur';
          v_msg := 'Aucun bail actif ne correspond : donnez l''email du locataire, ou le nom du lot (et du bien).';
        end if;
      else
        select p.id into v_person
          from public.persons p
         where p.organization_id = p_org
           and nullif(btrim(coalesce(v_ligne->>'proprietaire_email','')), '') is not null
           and lower(p.email) = lower(btrim(v_ligne->>'proprietaire_email'))
         limit 1;
        if v_person is null then
          v_statut := 'erreur';
          v_msg := 'Aucun propriétaire ne correspond : donnez son email, tel qu''il figure dans la fiche.';
        end if;
      end if;
    end if;

    -- Contrôles propres à chaque type, une fois le rattachement acquis.
    if v_statut = 'ok' then
      if v_type = 'depot_garantie' then
        if v_montant <= 0 then
          v_statut := 'erreur'; v_msg := 'Un dépôt de garantie repris est un montant positif.';
        elsif v_detenteur is null or v_detenteur not in ('agence','proprietaire') then
          -- L'anomalie que le référentiel nomme en exemple : sans détenteur,
          -- personne ne sait qui rendra le dépôt au locataire.
          v_statut := 'erreur';
          v_msg := 'Dépôt sans détenteur : précisez « agence » ou « proprietaire ».';
        else
          -- Colonnes QUALIFIÉES : `montant` et `bail_id` sont aussi des
          -- paramètres de sortie de cette fonction, et Postgres refuse de
          -- choisir à notre place.
          select coalesce(sum(de.montant), 0) into v_deja
            from public.depot_encaissements de where de.bail_id = v_bail;
          if v_deja > 0 then
            v_statut := 'erreur';
            v_msg := format('Un dépôt de %s € est déjà encaissé dans Gerimmo pour ce bail : le reprendre le compterait deux fois.',
                            replace(to_char(v_deja, 'FM999999990.00'), '.', ','));
          else
            select bx.depot_garantie into v_depot_bail
              from public.baux bx where bx.id = v_bail;
            if v_depot_bail is not null and v_depot_bail <> v_montant then
              v_statut := 'alerte';
              v_msg := format('Le bail porte un dépôt de %s €, le fichier %s € — le fichier fera foi.',
                              replace(to_char(v_depot_bail, 'FM999999990.00'), '.', ','),
                              replace(to_char(v_montant, 'FM999999990.00'), '.', ','));
            end if;
            if v_detenteur = 'proprietaire' then
              v_statut := 'alerte';
              v_msg := trim(both ' ' from coalesce(v_msg, '') ||
                ' Dépôt détenu par le propriétaire : il est enregistré, mais ne rentre pas dans votre trésorerie.');
            else
              v_tresorerie := true;
            end if;
          end if;
        end if;
      elsif v_type = 'solde_locataire' then
        if v_montant > 0 then
          v_tresorerie := true;  -- une avance : l'agence détient l'argent
        elsif v_montant < 0 then
          -- Une dette ne s'invente pas en écriture : elle se dit.
          v_statut := 'alerte';
          v_msg := 'Dette du locataire : enregistrée dans la balance, mais NON écrite au compte — reprenez-la par le parcours de relance.';
        else
          v_statut := 'alerte'; v_msg := 'Solde nul : la ligne ne sert à rien.';
        end if;
      else
        if v_montant <= 0 then
          v_statut := 'erreur';
          v_msg := format('Un montant de %s se reprend positif.',
            case v_type when 'provision_charges' then 'provisions' else 'fonds mandants' end);
        else
          v_tresorerie := true;
        end if;
      end if;
    end if;

    if v_statut = 'erreur' then v_bloquantes := v_bloquantes + 1; end if;
    if v_tresorerie then v_somme := v_somme + v_montant; end if;
    if v_statut = 'ok' and v_msg = '' then v_msg := 'Prêt à reprendre.'; end if;

    insert into tmp_reprise values
      (v_i, v_statut, v_msg, v_type, v_montant, v_tresorerie, v_bail, v_person, v_detenteur);
  end loop;

  -- L'écart zéro : le total annoncé contre la somme des lignes de trésorerie.
  v_ecart := round(coalesce(v_reprise.tresorerie_annoncee, 0) - v_somme, 2);

  if not p_controle_seulement then
    if v_bloquantes > 0 then
      raise exception 'reprendre_soldes: % ligne(s) en erreur — corrigez le fichier avant de basculer', v_bloquantes;
    end if;
    if v_ecart <> 0 then
      raise exception 'reprendre_soldes: ecart de % EUR entre le total annonce et le detail — la bascule exige un ecart nul',
        replace(to_char(v_ecart, 'FM999999990.00'), '.', ',');
    end if;

    -- On écrit. Toutes les lignes sont enregistrées, y compris celles qu'on
    -- n'applique pas : la balance d'ouverture doit rester lisible entière.
    insert into public.reprise_soldes
      (organization_id, reprise_id, bail_id, person_id, type, montant, detenteur, anomalie, statut, reference)
    select p_org, p_reprise, t.bail_id, t.person_id, t.type, t.montant, t.detenteur,
           nullif(case when t.statut = 'alerte' then t.message else '' end, ''),
           'valide', null
      from tmp_reprise t;

    -- Les dépôts que l'agence détient rejoignent les dépôts encaissés : c'est
    -- là que le produit les cherche, pour la restitution comme pour le solde
    -- de tout compte.
    insert into public.depot_encaissements
      (organization_id, bail_id, montant, date_encaissement, moyen, versant_libelle)
    select p_org, t.bail_id, t.montant, v_reprise.date_bascule,
           'reprise de portefeuille', 'Reprise du ' || to_char(v_reprise.date_bascule, 'DD/MM/YYYY')
      from tmp_reprise t
     where t.type = 'depot_garantie' and t.detenteur = 'agence' and t.statut <> 'erreur';

    -- Les avances des locataires deviennent des encaissements à la date de
    -- bascule : le prochain appel s'imputera dessus tout seul.
    insert into public.encaissements
      (organization_id, bail_id, montant, date_paiement, mode, note)
    select p_org, t.bail_id, t.montant, v_reprise.date_bascule,
           'reprise', 'Avance reprise au portefeuille'
      from tmp_reprise t
     where t.type = 'solde_locataire' and t.montant > 0 and t.statut <> 'erreur';

    -- Et ce que l'agence détient pour autrui entre au compte mandant, ventilé
    -- par propriétaire : « chaque euro détenu est dû à quelqu'un ».
    insert into public.mouvements_mandants
      (organization_id, mandant_person_id, type, sens, montant, appartient_a, piece, date_mouvement)
    select p_org, t.person_id,
           case t.type when 'fonds_mandant' then 'transfert_dg' else 'provision_travaux' end,
           'credit', t.montant,
           case t.type when 'fonds_mandant' then 'proprietaire' else 'locataire' end,
           'Reprise de portefeuille', v_reprise.date_bascule
      from tmp_reprise t
     where t.type in ('fonds_mandant', 'provision_charges') and t.statut <> 'erreur';

    update public.reprises_portefeuille
       set statut = 'basculee',
           basculee_le = now(),
           basculee_par = (select auth.uid()),
           totaux = jsonb_build_object(
             'tresorerie_annoncee', coalesce(v_reprise.tresorerie_annoncee, 0),
             'tresorerie_detail', v_somme,
             'ecart', v_ecart,
             'lignes', v_i)
     where id = p_reprise;
  else
    update public.reprises_portefeuille
       set statut = 'controle',
           totaux = jsonb_build_object(
             'tresorerie_annoncee', coalesce(v_reprise.tresorerie_annoncee, 0),
             'tresorerie_detail', v_somme,
             'ecart', v_ecart,
             'lignes', v_i,
             'erreurs', v_bloquantes)
     where id = p_reprise;
  end if;

  return query
    select t.ligne, t.statut, t.message, t.type, t.montant, t.tresorerie, t.bail_id, t.person_id
      from tmp_reprise t order by t.ligne;
end;
$$;
comment on function public.reprendre_soldes(uuid, uuid, jsonb, boolean) is
  'Contrôle (sans écrire) puis bascule une balance d''ouverture. La bascule exige zéro erreur et un écart nul entre le total annoncé et le détail.';
revoke execute on function public.reprendre_soldes(uuid, uuid, jsonb, boolean) from public, anon;

-- Abandonner une reprise en cours : le fichier était le mauvais, on recommence.
create or replace function public.abandonner_reprise(p_org uuid, p_reprise uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  -- Même garde que l'import du parc : une balance d'ouverture engage tout le
  -- portefeuille.
  if not (p_org in (select public.org_ids_avec_roles(
      array['admin_agence','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'abandonner_reprise: reserve au responsable de l''organisation';
  end if;
  update public.reprises_portefeuille
     set statut = 'abandonnee'
   where id = p_reprise and organization_id = p_org and statut in ('en_cours','controle');
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;
revoke execute on function public.abandonner_reprise(uuid, uuid) from public, anon;

-- Les trois tables portent une organisation : elles passent sous le verrou
-- d'abonnement, comme toutes les autres.
select public.poser_gardes_abonnement();
