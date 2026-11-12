-- La fiche complète est réservée aux gestionnaires et à la supervision.
-- Le portail expose seulement l’identité visuelle, et l’IBAN aux locataires actifs.
create or replace view public.organisations_portail with (security_barrier=true) as
select o.id, o.name, o.type, o.logo_url, o.couleur_primaire, o.couleur_secondaire, o.nom_portail,
  case when exists (select 1 from public.memberships loc where loc.organization_id=o.id
    and loc.account_id=(select auth.uid()) and loc.role='locataire' and loc.status='active')
  then o.iban end as iban
from public.organizations o
where o.id in (select public.user_org_ids());

revoke all on public.organisations_portail from public, anon, authenticated;
grant select on public.organisations_portail to authenticated;

-- La navigation conserve aussi les rôles sans organisation (supervision).
create or replace function public.mes_adhesions_navigation()
returns table(id uuid, role public.membership_role, organization jsonb)
language sql stable security invoker set search_path='' as $$
  select m.id,m.role,case when p.id is not null then jsonb_build_object('id',p.id,'name',p.name) end
  from public.memberships m left join public.organisations_portail p on p.id=m.organization_id
  where m.account_id=(select auth.uid()) and m.status='active'
  order by m.id;
$$;
revoke all on function public.mes_adhesions_navigation() from public, anon;
grant execute on function public.mes_adhesions_navigation() to authenticated;

notify pgrst, 'reload schema';
