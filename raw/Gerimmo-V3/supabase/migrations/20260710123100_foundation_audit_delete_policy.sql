-- GERIMMO V3 foundation RLS completion
-- Permanent audit log deletion is restricted to Super Admin only.

create policy audit_logs_delete_policy
on public.audit_logs for delete to authenticated
using (public.is_super_admin());
