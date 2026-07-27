-- GERIMMO V3 Sprint 11 - Expected backup verification schedules.

insert into public.backup_registry (backup_type, provider, status, retention_until, metadata)
select 'daily', 'supabase', 'scheduled', now() + interval '30 days', '{"schedule":"0 2 * * *","verification":"daily"}'::jsonb
where not exists (select 1 from public.backup_registry where backup_type = 'daily' and status = 'scheduled');

insert into public.backup_registry (backup_type, provider, status, retention_until, metadata)
select 'weekly', 'supabase', 'scheduled', now() + interval '90 days', '{"schedule":"0 3 * * 0","verification":"weekly"}'::jsonb
where not exists (select 1 from public.backup_registry where backup_type = 'weekly' and status = 'scheduled');
