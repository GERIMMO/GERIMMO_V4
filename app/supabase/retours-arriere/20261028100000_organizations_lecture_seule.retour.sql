-- Retour arrière de 20261028100000_organizations_lecture_seule.sql — audit final du 27/10/2026 (DRT-V01).
-- Retire le déclencheur `abonnement_organizations` et sa fonction, et `org_suspendue_par_supervision(uuid)` (DRT-04 :
-- remettre d'abord le code précédent, le bandeau et la page Abonnement l'appellent) : la fiche de l'organisation redevient modifiable
-- par ses gestionnaires pendant la lecture seule (le défaut DRT-V01). Aucune donnée n'est touchée ; les autres gardes
-- (`organizations_champs_reserves_sa`, `traversee_lecture_seule`, les 84 tables gardées) restent en place.
begin;
set local lock_timeout = '10s';
drop trigger if exists abonnement_organizations on public.organizations;
drop function if exists public.organizations_refuser_ecriture_si_fermee();
drop function if exists public.org_suspendue_par_supervision(uuid);
delete from supabase_migrations.schema_migrations where version = '20261028100000';
commit;
