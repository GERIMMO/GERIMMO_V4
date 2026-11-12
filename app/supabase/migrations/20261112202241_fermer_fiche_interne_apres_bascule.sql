-- Appliquer après la promotion des lecteurs du portail.
alter policy organizations_select on public.organizations using (
  id in (select public.org_ids_avec_roles(array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
  or (select public.is_super_admin())
);
notify pgrst, 'reload schema';
