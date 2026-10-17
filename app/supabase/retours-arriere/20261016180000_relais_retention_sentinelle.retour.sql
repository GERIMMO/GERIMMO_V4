-- Retour T12 : arrêter d’abord le code associé. Retirer le raccord puis la fonction.
-- Les définitions précédentes sont restaurées sans modifier leur contrôle d’accès.
-- La règle de conservation reste au catalogue (inerte sans raccord), pour préserver tout
-- réglage de durée ou désactivation. Aucune ligne déjà purgée ne peut être reconstituée ici.

do $t12$
declare d text; ancien constant text := $ancien$-- D48 (tour final du 16/10) : registres du relais et compteur des appels à l'IA, six mois (retention_rules « journal:… »).$ancien$; nouveau constant text := $nouveau$-- T12 (16/10) : le journal du planificateur suit aussi le catalogue.
  v_journaux := v_journaux || jsonb_build_object('cron_job_run_details', public.purger_journal_cron());

  -- D48 (tour final du 16/10) : registres du relais et compteur des appels à l'IA, six mois (retention_rules « journal:… »).$nouveau$;
begin
  select pg_get_functiondef('public.appliquer_retention()'::regprocedure) into d;
  if position(nouveau in d)=0 then
    if (length(d)-length(replace(d,ancien,'')))/length(ancien)=1 then return; end if;
    raise exception 'Retour T12 : définition inattendue de public.appliquer_retention()';
  end if;
  if (length(d)-length(replace(d,nouveau,'')))/length(nouveau)<>1 then raise exception 'Retour T12 : marque répétée de public.appliquer_retention()'; end if;
  execute replace(d,nouveau,ancien);
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
  if position(nouveau in d)=0 then
    if (length(d)-length(replace(d,ancien,'')))/length(ancien)=1 then return; end if;
    raise exception 'Retour T12 : définition inattendue de public.prendre_urgences_relais(integer)';
  end if;
  if (length(d)-length(replace(d,nouveau,'')))/length(nouveau)<>1 then raise exception 'Retour T12 : marque répétée de public.prendre_urgences_relais(integer)'; end if;
  execute replace(d,nouveau,ancien);
end $t12$;

do $t12$
declare d text; ancien constant text := $ancien$-- Décision D48 : six mois pour les registres d'exécution.
  delete from public.relais_alertes_envois where jour < (v_jour - interval '6 months')::date;$ancien$; nouveau constant text := $nouveau$-- T12 : la règle du catalogue commande aussi la purge propre au relais.
  delete from public.relais_alertes_envois where jour < (v_jour - make_interval(months =>
    (select duree_mois from public.retention_rules where data_type = 'journal:relais_alertes_envois' and actif and sort = 'suppression')))::date;$nouveau$;
begin
  select pg_get_functiondef('public.reserver_alerte_relais()'::regprocedure) into d;
  if position(nouveau in d)=0 then
    if (length(d)-length(replace(d,ancien,'')))/length(ancien)=1 then return; end if;
    raise exception 'Retour T12 : définition inattendue de public.reserver_alerte_relais()';
  end if;
  if (length(d)-length(replace(d,nouveau,'')))/length(nouveau)<>1 then raise exception 'Retour T12 : marque répétée de public.reserver_alerte_relais()'; end if;
  execute replace(d,nouveau,ancien);
end $t12$;

do $t12$
declare d text; ancien constant text := $ancien$        full join cron.job j on j.jobname = a.tache
       order by 1$ancien$; nouveau constant text := $nouveau$        full join cron.job j on j.jobname = a.tache
       where j.jobid is null or j.active
       order by 1$nouveau$;
begin
  select pg_get_functiondef('public.sentinelle_relais()'::regprocedure) into d;
  if position(nouveau in d)=0 then
    if (length(d)-length(replace(d,ancien,'')))/length(ancien)=1 then return; end if;
    raise exception 'Retour T12 : définition inattendue de public.sentinelle_relais()';
  end if;
  if (length(d)-length(replace(d,nouveau,'')))/length(nouveau)<>1 then raise exception 'Retour T12 : marque répétée de public.sentinelle_relais()'; end if;
  execute replace(d,nouveau,ancien);
end $t12$;

drop function if exists public.purger_journal_cron();

-- Même transaction externe que le DDL ci-dessus (psql --single-transaction).
-- Le chantier peut alors réappliquer exactement cette migration, sans historique mensonger.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'delete from supabase_migrations.schema_migrations where version=$1' using '20261016180000';
  end if;
end $historique$;
