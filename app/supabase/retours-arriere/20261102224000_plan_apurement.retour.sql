-- Retour du plan d'apurement (20261102224000). Remettre le code précédent d'abord.
-- Bloc atomique, sans valider la transaction externe. Refuse tant qu'un plan a été activé :
-- l'historique des tranches constatées fonde la reprise des relances et ne se supprime pas
-- d'un retour. Les plans seulement proposés ou annulés sont retirés avec le module.
-- Les relances automatiques reprennent leur définition sans le prédicat de suspension.
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261102224000_plan_apurement.retour.sql
do $retour_atomique$ declare definition text; begin
  if to_regclass('public.plans_apurement') is not null then
    lock table public.plans_apurement in access exclusive mode;
    if exists (select 1 from public.plans_apurement where etat in ('actif','en_defaut','caduc','solde')) then
      raise exception 'Retour refusé : des plans d''apurement ont été activés. Conserver leur historique ou décider de son archivage.';
    end if;
  end if;
  select pg_get_functiondef('public.relances_loyer_dues(integer)'::regprocedure) into definition;
  if position(' and not public.plan_apurement_suspend_relances(n.bail_id)' in definition) > 0 then
    execute replace(definition, ' and not public.plan_apurement_suspend_relances(n.bail_id)', '');
  end if;
  select pg_get_functiondef('public.libelle_generique_alerte(text)'::regprocedure) into definition;
  if position('plan_apurement_demande' in definition) > 0 then
    execute regexp_replace(definition, '\n    when ''plan_apurement_(demande|defaut|caduc|solde)'' then ''[^'']*''', '', 'g');
  end if;
  -- Une tâche déjà retirée n'est pas une erreur.
  if exists (select 1 from cron.job where jobname = 'plans-apurement-quotidiens') then
    perform cron.unschedule('plans-apurement-quotidiens');
  end if;
  delete from public.supervision_taches_arret where tache = 'plans-apurement-quotidiens';
  drop trigger if exists encaissement_plan on public.encaissements;
  drop function if exists public.encaissement_actualise_plan();
  drop function if exists public.suivre_plans_apurement_interne();
  drop function if exists public.plan_apurement_bail(uuid, uuid);
  drop function if exists public.ma_demande_plan_apurement(uuid);
  drop function if exists public.mon_plan_apurement(uuid);
  drop function if exists public.demander_plan_apurement(uuid, text);
  drop function if exists public.annuler_plan_apurement(uuid, uuid, text);
  drop function if exists public.activer_plan_apurement(uuid, uuid, date);
  drop function if exists public.suivre_plan_apurement(uuid);
  drop function if exists public.rattacher_document_plan_apurement(uuid, uuid, uuid, boolean);
  drop function if exists public.proposer_plan_apurement(uuid, uuid, integer, date, numeric, text, integer, integer);
  drop function if exists public.plan_apurement_suspend_relances(uuid);
  drop function if exists public.dette_echue_bail(uuid);
  drop table if exists public.plan_apurement_tranches;
  drop table if exists public.plans_apurement;
  drop function if exists public.plan_apurement_touche();
  drop function if exists public.verifier_locataire_du_bail(uuid, uuid);
  drop function if exists public.verifier_gerant_plan_apurement(uuid, uuid);
  delete from supabase_migrations.schema_migrations where version = '20261102224000';
end $retour_atomique$;
