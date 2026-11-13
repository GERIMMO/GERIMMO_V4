do $$
begin
 if to_regclass('public.representations_bail') is null then return; end if;
 lock table public.representations_bail in access exclusive mode nowait;
 if exists(select from public.representations_bail) or exists(select from public.audit_log where action='representation_bail') then raise exception 'Pouvoir déjà enregistré : conserver les preuves et corriger en avant.'; end if;
 drop trigger controler_pouvoir_envoi_bail on public.bail_signature_circuits;
 drop function public.controler_pouvoir_envoi_bail();
 drop function public.representants_actifs_bail(uuid);
 drop function public.designer_representant_bail(uuid,uuid,uuid,uuid,date);
 drop table public.representations_bail;
 delete from supabase_migrations.schema_migrations where version='20261113141000';
end $$;
notify pgrst,'reload schema';
