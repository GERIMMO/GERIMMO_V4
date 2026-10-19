-- RETOUR ARRIÈRE de 20261018100243_prestataire_signature_bail.sql (lot « supervision et signatures », 17-18/10/2026 ;
-- PR #203 : prestataire du circuit de signature, unicité de la référence externe par prestataire).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une
-- migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Revenir d'abord au code
-- applicatif antérieur (PR #203 : commit b5f70e6).
--
-- Transaction EXTERNE : aucun begin/commit ici, la moindre erreur annule tout. Usage :
--   psql "$URL" -v ON_ERROR_STOP=1 --single-transaction -f 20261018100243_prestataire_signature_bail.retour.sql
-- Ordre : après les retours de 20261018193308, 20261018185515 et 20261018143644 (garde ci-dessous), avant celui de
-- 20261018085521.
--
-- CONSERVE (aucun `drop column`) : la colonne bail_signature_circuits.prestataire et ses valeurs (elle dit quel
-- prestataire a émis chaque certificat archivé : perte de preuve si supprimée) ; toutes les lignes.
-- RETIRE : l'index unique bail_signature_reference_prestataire(prestataire,external_request_id).
-- RÉTABLIT : la contrainte bail_signature_circuits_external_request_id_key unique(external_request_id), forme
-- implicite de `external_request_id text unique` (ligne 15 de 20261018085521) ; refus s'il existe des références
-- externes partagées entre prestataires.
-- RÉINTRODUIT : impossibilité d'un même identifiant de demande chez deux prestataires.
-- Aucune fonction touchée : pas d'appel à fermer_fonctions_a_anon(). Rejouable.

set local lock_timeout = '10s';

-- Garde d'ordre : 20261018143644 et 20261018185515 citent la colonne prestataire dans des fonctions, 20261018193308
-- dans la contrainte signature_devis_cible.
do $ordre$
begin
  if to_regprocedure('public.reserver_budget_signature(uuid)') is not null
     or exists(select 1 from pg_constraint where conname = 'signature_devis_cible')
     or coalesce(strpos(pg_get_functiondef(to_regprocedure('public.archiver_signature_bail(uuid,uuid,jsonb)')), 'v.prestataire') > 0, false) then
    raise exception 'Retour 20261018100243 refusé : jouer d''abord les retours de 20261018193308, 20261018185515 et 20261018143644';
  end if;
end $ordre$;

do $unicite$
declare doublons integer;
begin
  if to_regclass('public.bail_signature_circuits') is null then
    raise notice 'bail_signature_circuits : table absente, rien à faire';
    return;
  end if;
  drop index if exists public.bail_signature_reference_prestataire;
  if exists(select 1 from pg_constraint where conname = 'bail_signature_circuits_external_request_id_key'
            and conrelid = 'public.bail_signature_circuits'::regclass) then
    raise notice 'bail_signature_circuits_external_request_id_key : déjà en place, rien à faire';
  else
    select count(*) into doublons from (
      select external_request_id from public.bail_signature_circuits
      where external_request_id is not null group by external_request_id having count(*) > 1
    ) d;
    if doublons > 0 then
      raise exception 'Retour 20261018100243 refusé : % référence(s) externe(s) partagée(s) entre prestataires ; trancher à la main avant de rétablir l''unicité', doublons;
    end if;
    alter table public.bail_signature_circuits add constraint bail_signature_circuits_external_request_id_key unique (external_request_id);
    raise notice 'bail_signature_circuits_external_request_id_key : unicité de la référence externe rétablie';
  end if;
  -- Gardé par l'existence de la COLONNE (comme le retour de 20261018061548) : un `comment on column` sur une colonne
  -- absente ferait échouer toute la transaction.
  if exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'bail_signature_circuits' and column_name = 'prestataire') then
    execute $c$comment on column public.bail_signature_circuits.prestataire is 'Conservée après le retour de 20261018100243 : prestataire de chaque circuit archivé (preuve) ; plus aucune lecture par l''application.'$c$;
  end if;
end $unicite$;

-- Même transaction externe que le retour : la version n'est plus « appliquée », migrations.yml pourra la rejouer.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version in ('20261018100243');
  end if;
end $historique$;
