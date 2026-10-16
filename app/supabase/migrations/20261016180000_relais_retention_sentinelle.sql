-- T12, 16/10/2026 : ignorer les tâches pg_cron volontairement désactivées, faire respecter
-- le catalogue par les purges propres au relais et donner une fin de vie au journal pg_cron.
-- Définitions production relues par SELECT pg_get_functiondef le 16/10 ; remplacement borné,
-- une occurrence exigée, droits existants conservés, arrêt si la définition a divergé.
-- Six mois par défaut comme les autres journaux d’exécution ; aucun réglage existant écrasé.
-- Aucun horaire ni état de tâche modifié. La migration elle-même ne purge aucune donnée.
-- La prochaine rétention supprime les passages TERMINÉS devenus trop anciens ; leurs lignes
-- ne sont récupérables que depuis une sauvegarde. Les passages sans fin ou en cours restent.
-- Retour : supabase/retours-arriere/20261016180000_relais_retention_sentinelle.retour.sql.

insert into public.retention_rules(data_type,libelle,finalite,declencheur,duree_mois,sort)
values ('journal:cron_job_run_details','Exécutions du planificateur de la base','Suivre les passages et échecs des tâches planifiées sans conserver indéfiniment leur journal','Fin du passage',6,'suppression')
on conflict (data_type) do nothing;

create or replace function public.purger_journal_cron()
returns bigint language plpgsql security definer set search_path = '' as $purge$
declare v_mois integer; v_nombre bigint := 0;
begin
  if (select auth.uid()) is not null and not public.is_super_admin() then
    raise exception 'Purge réservée à la supervision';
  end if;
  select duree_mois into v_mois from public.retention_rules
   where data_type='journal:cron_job_run_details' and actif and sort='suppression';
  if not found or to_regclass('cron.job_run_details') is null then return 0; end if;
  execute $sql$delete from cron.job_run_details
    where status in ('succeeded','failed') and end_time < now()-make_interval(months => $1)$sql$ using v_mois;
  get diagnostics v_nombre = row_count;
  if v_nombre > 0 then
    insert into public.tech_log(evenement,details)
    values('purge_journal_cron',jsonb_build_object('cron_job_run_details',v_nombre));
  end if;
  return v_nombre;
end $purge$;
revoke all on function public.purger_journal_cron() from public,anon,authenticated;
grant execute on function public.purger_journal_cron() to service_role;
comment on function public.purger_journal_cron() is 'T12 : purge des passages pg_cron terminés selon retention_rules ; appelée par appliquer_retention, sans contenu de tâche dans la trace.';

do $t12$
declare d text; ancien constant text := $ancien$        full join cron.job j on j.jobname = a.tache
       order by 1$ancien$; nouveau constant text := $nouveau$        full join cron.job j on j.jobname = a.tache
       where j.jobid is null or j.active
       order by 1$nouveau$;
begin
  select pg_get_functiondef('public.sentinelle_relais()'::regprocedure) into d;
  if (length(d)-length(replace(d,nouveau,'')))/length(nouveau)=1 then return; end if;
  if position(nouveau in d)>0 or (length(d)-length(replace(d,ancien,'')))/length(ancien)<>1 then
    raise exception 'T12 : définition inattendue de public.sentinelle_relais(), aucune réécriture';
  end if;
  execute replace(d,ancien,nouveau);
end $t12$;

do $t12$
declare d text; ancien constant text := $ancien$-- Décision D48 : six mois pour les registres d'exécution.
  delete from public.relais_alertes_envois where jour < (v_jour - interval '6 months')::date;$ancien$; nouveau constant text := $nouveau$-- T12 : la règle du catalogue commande aussi la purge propre au relais.
  delete from public.relais_alertes_envois where jour < (v_jour - make_interval(months =>
    (select duree_mois from public.retention_rules where data_type = 'journal:relais_alertes_envois' and actif and sort = 'suppression')))::date;$nouveau$;
begin
  select pg_get_functiondef('public.reserver_alerte_relais()'::regprocedure) into d;
  if (length(d)-length(replace(d,nouveau,'')))/length(nouveau)=1 then return; end if;
  if position(nouveau in d)>0 or (length(d)-length(replace(d,ancien,'')))/length(ancien)<>1 then
    raise exception 'T12 : définition inattendue de public.reserver_alerte_relais(), aucune réécriture';
  end if;
  execute replace(d,ancien,nouveau);
end $t12$;

do $t12$
declare d text; ancien constant text := $ancien$-- Décision D48 : six mois pour les registres d'exécution. Une urgence qui attend encore n'est jamais effacée.
  delete from public.relais_urgences
   where statut in ('envoyee', 'quotidien', 'non_envoyee') and traitee_le < now() - interval '6 months';
  delete from public.relais_urgences_envois e
   where e.statut in ('envoye', 'abandonne') and e.commence_le < now() - interval '6 months'
     and not exists (select 1 from public.relais_urgences u where u.envoi_id = e.id);$ancien$; nouveau constant text := $nouveau$-- T12 : chaque registre suit sa règle ; aucune urgence en attente ni aucun envoi cité n'est effacé.
  delete from public.relais_urgences
   where statut in ('envoyee', 'quotidien', 'non_envoyee') and traitee_le < now() - make_interval(months =>
     (select duree_mois from public.retention_rules where data_type = 'journal:relais_urgences' and actif and sort = 'suppression'));
  delete from public.relais_urgences_envois e
   where e.statut in ('envoye', 'abandonne') and e.commence_le < now() - make_interval(months =>
     (select duree_mois from public.retention_rules where data_type = 'journal:relais_urgences_envois' and actif and sort = 'suppression'))
     and not exists (select 1 from public.relais_urgences u where u.envoi_id = e.id);$nouveau$;
begin
  select pg_get_functiondef('public.prendre_urgences_relais(integer)'::regprocedure) into d;
  if (length(d)-length(replace(d,nouveau,'')))/length(nouveau)=1 then return; end if;
  if position(nouveau in d)>0 or (length(d)-length(replace(d,ancien,'')))/length(ancien)<>1 then
    raise exception 'T12 : définition inattendue de public.prendre_urgences_relais(integer), aucune réécriture';
  end if;
  execute replace(d,ancien,nouveau);
end $t12$;

do $t12$
declare d text; ancien constant text := $ancien$-- D48 (tour final du 16/10) : registres du relais et compteur des appels à l'IA, six mois (retention_rules « journal:… »).$ancien$; nouveau constant text := $nouveau$-- T12 (16/10) : le journal du planificateur suit aussi le catalogue.
  v_journaux := v_journaux || jsonb_build_object('cron_job_run_details', public.purger_journal_cron());

  -- D48 (tour final du 16/10) : registres du relais et compteur des appels à l'IA, six mois (retention_rules « journal:… »).$nouveau$;
begin
  select pg_get_functiondef('public.appliquer_retention()'::regprocedure) into d;
  if (length(d)-length(replace(d,nouveau,'')))/length(nouveau)=1 then return; end if;
  if position(nouveau in d)>0 or (length(d)-length(replace(d,ancien,'')))/length(ancien)<>1 then
    raise exception 'T12 : définition inattendue de public.appliquer_retention(), aucune réécriture';
  end if;
  execute replace(d,ancien,nouveau);
end $t12$;
