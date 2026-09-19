-- LES RELANCES D'IMPAYÉ PARTENT SEULES — pour qui l'a demandé (20/09).
--
-- Le geste le plus répétitif de la gestion locative : constater l'impayé,
-- ouvrir le bail, choisir « Relance 1 », dater, enregistrer — puis recommencer
-- quinze jours plus tard. Le référentiel prévoit des relances à seuils
-- paramétrables, et la relance est une preuve. Rien n'empêchait qu'elle parte
-- seule, sauf que personne ne l'avait écrit.
--
-- CE QUI EST AUTOMATISÉ, ET CE QUI NE L'EST PAS.
--  · relance 1 et relance 2, par e-mail au locataire, aux délais que l'agence
--    fixe (5 puis 15 jours après l'échéance, par défaut) ;
--  · la mise en demeure, JAMAIS : c'est un recommandé, un acte qui engage —
--    elle reste un geste du gérant, avec sa date de première présentation.
--
-- LES MÊMES GARDES QUE LES QUITTANCES ET LES AVIS D'ÉCHÉANCE : un accord
-- permanent, faux par défaut (`relances_envoi_auto`) ; une organisation
-- suspendue n'écrit plus en son nom ; un locataire sans adresse n'est pas
-- relancé en silence, il est rapporté par la tâche.
--
-- ET DEUX GARDES PROPRES AUX RELANCES :
--  · jamais deux courriers le même jour sur le même bail — qu'ils viennent
--    du gérant ou de la tâche ;
--  · une relance consignée par le gérant compte : si l'agence a relancé à la
--    main, la tâche ne recommence pas au niveau 1, elle passe au suivant.
--
-- Le terme relancé est le plus ancien encore impayé (RM-3.3.2 : l'argent va
-- au plus ancien, la relance aussi). La relance se consigne dans la table
-- `relances` exactement comme si le gérant l'avait saisie — même chronologie,
-- même preuve — avec son origine.

-- ------------------------------------------------------------
-- 1. Les réglages de l'organisation
-- ------------------------------------------------------------
alter table public.organizations
  add column if not exists relances_envoi_auto boolean not null default false,
  add column if not exists relance_1_jours integer not null default 5,
  add column if not exists relance_2_jours integer not null default 15;
comment on column public.organizations.relances_envoi_auto is
  'L''organisation a donne son accord permanent pour que les relances 1 et 2 d''impaye partent au locataire par e-mail, aux delais fixes. Faux par defaut. La mise en demeure reste manuelle.';
comment on column public.organizations.relance_1_jours is
  'Jours apres l''echeance impayee avant la premiere relance automatique (1 a 60).';
comment on column public.organizations.relance_2_jours is
  'Jours apres l''echeance impayee avant la seconde relance automatique (superieur au premier delai, 90 au plus).';
alter table public.organizations drop constraint if exists organizations_relances_delais_check;
alter table public.organizations add constraint organizations_relances_delais_check
  check (
    relance_1_jours between 1 and 60
    and relance_2_jours between 2 and 90
    and relance_2_jours > relance_1_jours
  );

-- ------------------------------------------------------------
-- 2. D'où vient une relance
-- ------------------------------------------------------------
alter table public.relances
  add column if not exists origine text not null default 'gerant';
alter table public.relances drop constraint if exists relances_origine_check;
alter table public.relances add constraint relances_origine_check
  check (origine in ('gerant', 'automatique'));
comment on column public.relances.origine is
  'gerant : saisie sur la fiche du bail ; automatique : envoyee par la tache du matin (e-mail au locataire).';

-- ------------------------------------------------------------
-- 3. Ce que la tâche du matin a le droit de voir
-- ------------------------------------------------------------
create or replace function public.relances_loyer_dues(p_limite integer default 200)
returns table (
  bail_id uuid,
  organization_id uuid,
  niveau text,
  destinataire text,
  prenom text,
  emetteur text,
  lot text,
  periode date,
  date_echeance date,
  reste numeric,
  jours_retard integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  with candidats as (
    select
      b.id as bail_id,
      b.organization_id,
      o.name as emetteur,
      o.relance_1_jours,
      o.relance_2_jours,
      l.nom as lot,
      loc.email as destinataire,
      loc.prenom,
      x.periode,
      x.date_echeance,
      round(x.montant_du - x.montant_couvert, 2) as reste,
      (current_date - x.date_echeance)::integer as jours_retard
    from public.baux b
    join public.organizations o on o.id = b.organization_id
    join public.lots l on l.id = b.lot_id
    join public.persons loc on loc.id = b.locataire_principal
    cross join lateral (
      -- Le terme impayé le plus ancien : c'est lui qu'on relance.
      select e.periode, e.date_echeance, e.montant_du, e.montant_couvert
      from public.etat_loyers_bail_brut(b.id) e
      where e.montant_couvert < e.montant_du
        and e.date_echeance < current_date
      order by e.periode
      limit 1
    ) x
    where b.etat in ('actif', 'preavis')
      and o.relances_envoi_auto
      -- Une organisation suspendue n'écrit plus rien en son nom.
      and public.org_ecriture_ouverte(o.id)
      and loc.email is not null and length(btrim(loc.email)) > 0
  ), niveaux as (
    select
      c.*,
      exists (
        select 1 from public.relances r
        where r.bail_id = c.bail_id and r.date_envoi >= c.date_echeance
          and r.niveau = 'relance_1'
      ) as a_relance_1,
      exists (
        select 1 from public.relances r
        where r.bail_id = c.bail_id and r.date_envoi >= c.date_echeance
          and r.niveau in ('relance_2', 'mise_en_demeure')
      ) as a_relance_2,
      exists (
        select 1 from public.relances r
        where r.bail_id = c.bail_id and r.date_envoi = current_date
      ) as relance_du_jour
    from candidats c
  )
  select
    n.bail_id,
    n.organization_id,
    case when not n.a_relance_1 then 'relance_1' else 'relance_2' end as niveau,
    n.destinataire,
    n.prenom,
    n.emetteur,
    n.lot,
    n.periode,
    n.date_echeance,
    n.reste,
    n.jours_retard
  from niveaux n
  where not n.relance_du_jour
    and (
      (not n.a_relance_1 and n.jours_retard >= n.relance_1_jours)
      or (n.a_relance_1 and not n.a_relance_2 and n.jours_retard >= n.relance_2_jours)
    )
  order by n.date_echeance, n.bail_id
  limit greatest(1, least(p_limite, 500));
end;
$$;
revoke execute on function public.relances_loyer_dues(integer) from public, anon, authenticated;
grant execute on function public.relances_loyer_dues(integer) to service_role;
comment on function public.relances_loyer_dues(integer) is
  'Les relances 1 et 2 d''impaye qui doivent partir aujourd''hui, pour les organisations qui l''ont demande. Reservee a la tache du matin.';

-- ------------------------------------------------------------
-- 4. Consigner ce qui est parti — après l'envoi, jamais avant
-- ------------------------------------------------------------
create or replace function public.relance_loyer_consigner(p_bail uuid, p_niveau text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid;
begin
  if p_niveau not in ('relance_1', 'relance_2') then
    raise exception 'relance_loyer_consigner: le niveau % ne s''automatise pas', p_niveau;
  end if;
  select b.organization_id into v_org from public.baux b where b.id = p_bail;
  if v_org is null then
    raise exception 'relance_loyer_consigner: bail inconnu';
  end if;
  -- Jamais deux courriers le même jour sur le même bail.
  if exists (
    select 1 from public.relances r where r.bail_id = p_bail and r.date_envoi = current_date
  ) then
    return null;
  end if;
  insert into public.relances (organization_id, bail_id, niveau, date_envoi, note, origine)
  values (v_org, p_bail, p_niveau, current_date, nullif(btrim(coalesce(p_note, '')), ''), 'automatique')
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.relance_loyer_consigner(uuid, text, text) from public, anon, authenticated;
grant execute on function public.relance_loyer_consigner(uuid, text, text) to service_role;
comment on function public.relance_loyer_consigner(uuid, text, text) is
  'Consigne une relance automatique sur le bail, une fois l''e-mail parti. Reservee a la tache du matin.';

-- La garde d'abonnement se repose sur toutes les tables, comme après chaque
-- migration.
select public.poser_gardes_abonnement();

-- Et aucune fonction de `public` ne reste exécutable par `anon`.
select public.fermer_fonctions_a_anon();
