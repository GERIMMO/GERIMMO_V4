-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014101000_cle_envoi_depot_garantie.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Défait : la fonction `encaisser_depot` à sept paramètres (remplacée par celle à six), l'index unique partiel
-- `depot_encaissements_cle_envoi_unique` et la colonne facultative `depot_encaissements.cle_envoi`. Aucun dépôt n'est
-- réécrit ni supprimé : seule disparaît la clé d'envoi (une référence technique) des dépôts saisis depuis la migration.
--
-- Définition antérieure : extraite (pg_get_functiondef) d'une base reconstruite en rejouant les migrations d'origine
-- SANS cette migration, puis recopiée ici par un générateur — elle n'est pas écrite à la main. Ses droits sont ceux
-- d'origine (compte connecté et service, ni public ni anon). Rejouable : sans la signature à sept paramètres, la
-- fonction est laissée telle quelle.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014101000_cle_envoi_depot_garantie.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : un encaissement de dépôt de garantie peut de nouveau être rejoué après une réponse
-- perdue (PR178-B-06). ATTENTION, le code de l'application n'est pas défait par ce script : l'application candidate
-- appelle `encaisser_depot` avec `p_cle_envoi` ; sur une base revenue en arrière, l'encaissement d'un dépôt échouerait.
-- Revenir d'abord au code précédent avant de jouer ce script.

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

do $retour_arriere$
declare v_cles bigint;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'depot_encaissements' and column_name = 'cle_envoi') then
    execute 'select count(*) from public.depot_encaissements where cle_envoi is not null' into v_cles;
    raise notice 'Retour arrière 20261014101000 : % clé(s) d''envoi de dépôt vont disparaître (les dépôts restent).', v_cles;
  else
    raise notice 'Retour arrière 20261014101000 : la colonne depot_encaissements.cle_envoi est déjà absente.';
  end if;
end $retour_arriere$;

-- La fonction d'abord (elle écrit la colonne), puis la colonne.
do $retour_arriere$
begin
  if to_regprocedure('public.encaisser_depot(uuid,numeric,date,text,uuid,text,uuid)') is null then
    raise notice 'public.encaisser_depot : signature à sept paramètres absente, rien à faire';
    return;
  end if;
  execute $definition_anterieure$CREATE OR REPLACE FUNCTION public.encaisser_depot(p_bail uuid, p_montant numeric, p_date date, p_moyen text, p_versant_person uuid DEFAULT NULL::uuid, p_versant_libelle text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v record; v_plafond numeric; v_cumul numeric; v_mois integer; v_meuble boolean; v_enc uuid;
        v_loyer_fixe numeric;
begin
  select * into v from public.baux where id = p_bail;
  if v.id is null then raise exception 'Bail introuvable'; end if;
  if not (v.organization_id in (select public.org_ids_avec_roles(
      array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))) then
    raise exception 'Accès refusé';
  end if;

  -- Le dépôt s'encaisse à l'entrée, il se restitue à la sortie (RM-2.1.3)
  if v.etat = 'termine' then
    raise exception 'Bail terminé : le dépôt de garantie ne s''encaisse plus, il se restitue';
  end if;
  -- Décompte figé après envoi (RM-2.7.3) : plus rien n'entre après l'arrêté
  if exists (select 1 from public.restitutions r
             where r.bail_id = p_bail and r.statut = 'finalise') then
    raise exception 'Décompte de restitution finalisé : le dépôt de ce bail ne s''encaisse plus';
  end if;

  if p_montant is null or p_montant <= 0 then raise exception 'Montant invalide'; end if;

  select coalesce(l.meuble, false) into v_meuble from public.lots l where l.id = v.lot_id;
  v_mois := public.plafond_depot_mois(v.type::text, v.lot_id);
  -- Audit 27/09 : le plafond se mesure au loyer fixé à la signature, pas au
  -- loyer révisé depuis (RM-2.1.5).
  select r.ancien_loyer into v_loyer_fixe
    from public.revisions_loyer r where r.bail_id = p_bail
   order by r.date_effet asc limit 1;
  v_plafond := coalesce(v_loyer_fixe, v.loyer_hc, 0) * v_mois;
  if coalesce(v.depot_garantie, 0) > v_plafond then
    raise exception 'Dépôt de % € supérieur au plafond légal de % € (% mois hors charges)',
      v.depot_garantie, v_plafond, v_mois;
  end if;

  select coalesce(sum(montant), 0) into v_cumul from public.depot_encaissements where bail_id = p_bail;
  if v_cumul + p_montant > coalesce(v.depot_garantie, 0) then
    raise exception 'Encaissement (% €) dépasse le dépôt dû restant (% €)',
      p_montant, coalesce(v.depot_garantie, 0) - v_cumul;
  end if;

  insert into public.depot_encaissements
    (organization_id, bail_id, montant, date_encaissement, moyen, versant_person_id, versant_libelle)
  values (v.organization_id, p_bail, p_montant, coalesce(p_date, current_date), p_moyen,
          p_versant_person, p_versant_libelle)
  returning id into v_enc;

  insert into public.ecritures
    (organization_id, bail_id, lot_id, categorie, sens, montant, date_piece, date_imputation, libelle, systeme, depot_encaissement_id)
  values (v.organization_id, p_bail, v.lot_id, 'depot_garantie', 'recette', p_montant,
          coalesce(p_date, current_date), coalesce(p_date, current_date),
          'Encaissement du dépôt de garantie', true, v_enc);
  return v_cumul + p_montant;
end $function$
$definition_anterieure$;
  drop function public.encaisser_depot(uuid, numeric, date, text, uuid, text, uuid);
  revoke all on function public.encaisser_depot(uuid, numeric, date, text, uuid, text) from public, anon;
  grant execute on function public.encaisser_depot(uuid, numeric, date, text, uuid, text) to authenticated, service_role;
  raise notice 'public.encaisser_depot : définition antérieure rétablie';
end $retour_arriere$;

drop index if exists public.depot_encaissements_cle_envoi_unique;
alter table public.depot_encaissements drop column if exists cle_envoi;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014101000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
