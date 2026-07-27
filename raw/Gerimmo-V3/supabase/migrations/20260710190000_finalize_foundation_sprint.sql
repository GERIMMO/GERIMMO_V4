-- GERIMMO V3 foundation finalization
-- Keeps the foundation schema usable through Supabase Auth/PostgREST without creating business modules.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on table public.profiles to authenticated, service_role;
grant select, insert, update, delete on table public.organizations to authenticated, service_role;
grant select, insert, update, delete on table public.organization_members to authenticated, service_role;
grant select, insert, update, delete on table public.roles to authenticated, service_role;
grant select, insert, update, delete on table public.permissions to authenticated, service_role;
grant select, insert, update, delete on table public.role_permissions to authenticated, service_role;
grant select, insert, update, delete on table public.member_role_assignments to authenticated, service_role;
grant select, delete on table public.audit_logs to authenticated, service_role;
grant insert on table public.audit_logs to service_role;

grant execute on function public.current_profile_id() to authenticated, service_role;
grant execute on function public.is_super_admin() to authenticated, service_role;
grant execute on function public.is_active_organization_member(uuid) to authenticated, service_role;
grant execute on function public.has_organization_role(uuid, text[]) to authenticated, service_role;
grant execute on function public.can_manage_organization(uuid) to authenticated, service_role;
grant execute on function public.can_access_profile(uuid) to authenticated, service_role;
grant execute on function public.can_access_organization_member(uuid) to authenticated, service_role;

drop policy if exists audit_logs_delete_policy on public.audit_logs;
create policy audit_logs_delete_policy
on public.audit_logs for delete to authenticated
using (public.is_super_admin());
