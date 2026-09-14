-- Déployer d’abord l’écran /securite, puis appliquer cette protection.
-- Le JWT signé par Supabase Auth doit attester la validation du second facteur.
-- Les adhésions propres restent lisibles à AAL1 pour permettre la configuration.
create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select auth.jwt())->>'aal' = 'aal2', false)
    and exists (
      select 1 from public.memberships m
      where m.account_id = (select auth.uid())
        and m.role = 'super_admin' and m.status = 'active'
    );
$$;
revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;
comment on function public.is_super_admin() is
  'Supervision : adhésion active et session Supabase Auth avec second facteur vérifié (AAL2).';
