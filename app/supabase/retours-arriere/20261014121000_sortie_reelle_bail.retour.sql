-- RETOUR ARRIÈRE de 20261014121000_sortie_reelle_bail.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Définitions antérieures : extraites (pg_get_functiondef) d'une base reconstruite en rejouant les
-- migrations d'origine SANS cette migration, puis recopiées ici par un générateur — aucune n'est écrite
-- à la main. Rejouable : sans la marque du correctif dans la définition en vigueur, la fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014121000_sortie_reelle_bail.retour.sql
--
-- RÉINTRODUIT les défauts corrigés : SOR-03 (un bail peut être activé avec une entrée antérieure à la sortie du bail
-- précédent du même lot) et SOR-04 (une clôture avant la fin du préavis ne demande plus de confirmation et n'enregistre
-- plus de sortie réelle). terminer_bail(uuid) retrouve son seul argument : tout appel à trois arguments (écran de
-- clôture de l'application candidate) échouera tant que le code applicatif n'est pas revenu lui aussi.
-- 
-- NE SUPPRIME PAS la colonne baux.date_sortie_reelle ni ses valeurs : ce sont des données saisies, elles restent
-- (colonne facultative, sans effet une fois les fonctions revenues). Un `alter table public.baux drop column
-- date_sortie_reelle` ne se joue qu'après décision écrite du dirigeant, à la main, hors de ce script.

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

-- D34 : clôture avec date de sortie réelle (retour à la signature à un argument)
do $retour_arriere$
begin
  if to_regprocedure('public.terminer_bail(uuid,date,boolean)') is not null
     and position($marque$Décision D34 du 14/10 (SOR-04)$marque$ in pg_get_functiondef(to_regprocedure('public.terminer_bail(uuid,date,boolean)'))) > 0 then
    drop function public.terminer_bail(uuid,date,boolean);
    execute $definition_anterieure$CREATE OR REPLACE FUNCTION public.terminer_bail(p_bail uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_bail record;
begin
  select b.* into v_bail from public.baux b where b.id = p_bail;
  if v_bail.id is null then raise exception 'Bail introuvable'; end if;
  if not (v_bail.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v_bail.etat <> 'preavis' then
    raise exception 'Seul un bail en préavis se clôture — enregistrez d''abord le congé';
  end if;
  if not exists (select 1 from public.etats_des_lieux e
                 where e.bail_id = p_bail and e.type = 'sortie' and e.etat = 'signe') then
    raise exception 'Clôture impossible sans état des lieux de sortie signé (RM-3.11.2)';
  end if;

  update public.baux set etat = 'termine', updated_at = now() where id = p_bail;
  update public.lots set etat = public.etat_location_du_lot(v_bail.lot_id) where id = v_bail.lot_id and etat in ('loue','preavis');

  -- Les personnes du bail sans autre bail vivant perdent le geste, pas la
  -- lecture : adhésion locataire désactivée (espace en consultation, D2)
  update public.memberships m
     set status = 'inactive'
   where m.organization_id = v_bail.organization_id
     and m.role = 'locataire' and m.status = 'active'
     and m.account_id in (
       select p.account_id from public.persons p
       where p.organization_id = v_bail.organization_id
         and p.account_id is not null
         and (p.id = v_bail.locataire_principal
              or exists (select 1 from public.bail_personnes bp
                         where bp.bail_id = p_bail and bp.person_id = p.id)))
     and not exists (
       select 1 from public.baux b2
       join public.persons p2 on p2.account_id = m.account_id
                             and p2.organization_id = b2.organization_id
       where b2.organization_id = v_bail.organization_id
         and b2.etat in ('actif', 'preavis')
         and (b2.locataire_principal = p2.id
              or exists (select 1 from public.bail_personnes bp2
                         where bp2.bail_id = b2.id and bp2.person_id = p2.id)));

  -- Les alertes encore ouvertes du bail (EDL de sortie, intention) se ferment
  update public.alerts
     set statut = 'fermee', closed_at = now(), closed_by = (select auth.uid()),
         closed_action = 'Bail clôturé'
   where organization_id = v_bail.organization_id and statut = 'ouverte'
     and details ->> 'bail_id' = p_bail::text
     and type in ('edl_sortie', 'edl_entree', 'conge_intention');
end;
$function$
$definition_anterieure$;
    revoke all on function public.terminer_bail(uuid) from public, anon;
    grant execute on function public.terminer_bail(uuid) to authenticated, service_role;
    raise notice 'public.terminer_bail(uuid) : définition antérieure rétablie';
  else
    raise notice 'public.terminer_bail(uuid,date,boolean) : marque du correctif absente, rien à faire';
  end if;
end $retour_arriere$;

-- D34 : le bail suivant n'entre pas avant la sortie du précédent
select pg_temp.restaurer_fonction('public.controler_mise_en_location(uuid)',
  $marque$Décision D34 du 14/10 (SOR-03)$marque$,
$definition_anterieure$CREATE OR REPLACE FUNCTION public.controler_mise_en_location(p_bail uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v record;
  v_lot record;
  v_blocages text[];
  v_mentions text[];
  v_plafond numeric;
begin
  select * into v from public.baux where id = p_bail;
  perform 1 from public.lots where id = v.lot_id for update;
  if not found then raise exception 'Bail introuvable'; end if;

  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;
  if v.etat <> 'brouillon' then
    raise exception 'Seul un bail en brouillon peut être activé';
  end if;

  -- Mentions obligatoires du contrat : sans elles, le bail activé est un bail
  -- faux — appels de loyer à 0 €, prorata d'entrée arbitraire, dépôt sans plafond
  -- opposable (wiki « Mentions obligatoires du bail »).
  v_mentions := public.bail_mentions_manquantes_valeurs(v.locataire_principal, v.date_debut, v.loyer_hc);
  if array_length(v_mentions, 1) > 0 then
    raise exception 'Mentions obligatoires du bail manquantes : % — à compléter dans le brouillon avant de déposer le bail signé',
      array_to_string(v_mentions, ' ; ');
  end if;

  if v.depot_garantie is not null then
    v_plafond := public.plafond_depot_mois(v.type::text, v.lot_id) * v.loyer_hc;
    if v.depot_garantie > v_plafond then
      raise exception 'Dépôt de garantie trop élevé : maximum % mois de loyer hors charges (soit % €)',
        public.plafond_depot_mois(v.type::text, v.lot_id), v_plafond;
    end if;
  end if;

  -- Audit 29/09 : une agence ne loue qu'un lot confié par un mandat en cours.
  if (select o.type from public.organizations o where o.id = v.organization_id) = 'agence'
     and not public.lot_couvert_par_mandat(v.lot_id) then
    raise exception 'Mise en location refusée : aucun mandat de gestion en cours ne couvre ce lot. Une agence ne peut ni louer ni encaisser pour le compte d''un propriétaire sans mandat écrit (loi Hoguet, art. 6) — faites signer et activez le mandat, puis réessayez';
  end if;

  -- Un seul bail actif par lot ; le brouillon suivant attend la fin du précédent
  if exists (
    select 1 from public.baux b
    where b.lot_id = v.lot_id and b.id <> p_bail and b.etat in ('actif', 'preavis')
      and (v.chambre_id is null or b.chambre_id is null or b.chambre_id = v.chambre_id)
  ) then
    raise exception 'Un bail est déjà en cours sur ce lot : il doit être terminé avant de déposer celui-ci';
  end if;

  select * into v_lot from public.lots where id = v.lot_id;
  if v_lot.etat <> 'disponible' and not (v.chambre_id is not null and v_lot.etat in ('loue','preavis')) then
    raise exception 'Le lot doit être « disponible » pour être loué (actuel : %)', v_lot.etat;
  end if;

  v_blocages := public.lot_blocages_location(v.lot_id);
  if array_length(v_blocages, 1) > 0 then
    raise exception 'Mise en location bloquée : %', array_to_string(v_blocages, ' ; ');
  end if;
end;
$function$
$definition_anterieure$);

-- La colonne reste : on dit seulement combien de sorties réelles elle porte.
do $retour_arriere$
declare v_n bigint;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'baux' and column_name = 'date_sortie_reelle') then
    execute 'select count(*) from public.baux where date_sortie_reelle is not null' into v_n;
    raise notice 'baux.date_sortie_reelle conservée : % bail(s) portent une sortie réelle', v_n;
  end if;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014121000';
  end if;
end $retour_arriere$;

commit;
