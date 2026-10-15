-- RETOUR ARRIÈRE de 20261014415000_reprise_soldes_au_centime.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Défait : le contrôle « au centime près » de reprendre_soldes (marque `Décision X09 du 15/10 (FIN-03, reprise de soldes)`) et le refus des
-- montants qui ne sont pas des nombres.
-- Définition antérieure : extraite (pg_get_functiondef) d'une base reconstruite en rejouant les migrations d'origine SANS cette
-- migration, puis recopiée ici par un générateur — aucune n'est écrite à la main. Rejouable : sans la marque du correctif dans la
-- définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014415000_reprise_soldes_au_centime.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (constat de relecture du 15/10 sur FIN-03) : le contrôle d'une reprise peut de nouveau annoncer
-- « Prêt à reprendre. » pour une ligne à trois décimales que la contrainte de centime des encaissements refusera à la bascule (message
-- générique), et les autres types de ligne à trois décimales sont de nouveau arrondis en silence à l'écriture. Aucune donnée n'est
-- touchée : aucune reprise n'a jamais été écrite par un refus.

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.
-- Hors transaction, l'instruction démarre à l'instant même de sa transaction ; dans un lot, elle est plus tardive.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;


begin;
set local lock_timeout = '10s';

-- Outil local à cette session (pg_temp : disparaît à la fin de la connexion, rien n'est créé dans public).
-- Rétablit la définition ANTÉRIEURE (reprise de la base reconstruite par les migrations d'origine) si, et
-- seulement si, la définition en vigueur porte la marque du correctif. Sans la marque, la fonction est
-- déjà revenue (rejeu) ou a été réécrite depuis : on n'y touche pas.
create function pg_temp.restaurer_fonction(p_signature text, p_marque text, p_definition text)
returns text language plpgsql as $retour_arriere$
declare v_oid regprocedure := to_regprocedure(p_signature); v_courante text;
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue)', p_signature;
  end if;
  v_courante := pg_get_functiondef(v_oid);
  if position(p_marque in v_courante) = 0 then
    return p_signature || ' : marque du correctif absente, rien à faire';
  end if;
  execute p_definition;
  return p_signature || ' : définition antérieure rétablie';
end $retour_arriere$;

-- X09 : reprendre_soldes sans le contrôle du centime
select pg_temp.restaurer_fonction('public.reprendre_soldes(uuid,uuid,jsonb,boolean)',
  $marque$Décision X09 du 15/10 (FIN-03, reprise de soldes)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.reprendre_soldes(p_org uuid, p_reprise uuid, p_lignes jsonb, p_controle_seulement boolean DEFAULT true)
 RETURNS TABLE(ligne integer, statut text, message text, type text, montant numeric, tresorerie boolean, bail_id uuid, person_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
$definition_anterieure$);


-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014415000';
  end if;
end $retour_arriere$;

commit;
