-- Super admin transverse (décision Tahir 09/09 : « seulement super admin, et
-- toutes les autorisations »). Presque toutes les policies RLS et RPC gérants
-- passent par org_ids_avec_roles : lui apprendre le super admin donne l'accès
-- partout, d'un seul geste — le super admin est réputé porter tous les rôles
-- gérants dans toutes les organisations. La traçabilité ne change pas
-- (audit_log, acces_pieces_log tracent le compte, pas le rôle).
create or replace function public.org_ids_avec_roles(roles public.membership_role[])
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.organization_id
  from public.memberships m
  where m.account_id = (select auth.uid())
    and m.status = 'active'
    and m.organization_id is not null
    and m.role = any (roles)
  union
  select o.id from public.organizations o where public.is_super_admin();
$$;
