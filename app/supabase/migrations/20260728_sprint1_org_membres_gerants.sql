-- Les cibles possibles d'une assignation/escalade d'alerte : les gérants de
-- l'agence. Fonction definer car un agent ne lit pas les adhésions des autres
-- (memberships_select) mais doit pouvoir escalader nominativement (module 14).
-- Appliquée le 2026-07-28 sur « Gerimmo V4 » via MCP. Copie de référence.
create function public.org_membres_gerants(org uuid)
returns table (account_id uuid, email text, role public.membership_role)
language sql
stable
security definer
set search_path = ''
as $$
  select m.account_id, a.email, m.role
  from public.memberships m
  join public.accounts a on a.id = m.account_id
  where m.organization_id = org
    and m.status = 'active'
    and m.role in ('admin_agence', 'agent', 'proprietaire_direct')
    and (
      org in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
      or public.is_super_admin()
    )
  order by a.email;
$$;
revoke execute on function public.org_membres_gerants(uuid) from public, anon;
