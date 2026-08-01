-- Le marquage email_envoye_at nécessite une policy UPDATE (gérants).
create policy quittances_update on public.quittances for update
  using (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])))
  with check (organization_id in (select public.org_ids_avec_roles(
    array['admin_agence','agent','proprietaire_direct']::public.membership_role[])));
