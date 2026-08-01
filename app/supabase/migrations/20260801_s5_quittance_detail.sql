-- Sprint 5 : détail d'une quittance pour l'afficher/imprimer. Accessible au gérant
-- de l'agence OU au locataire concerné (loyer et charges séparés — quittance conforme).
create function public.quittance_detail(p_quittance uuid)
returns table (
  emetteur text, proprietaire text, locataire text, adresse text, lot_nom text,
  periode date, loyer_hc numeric, charges numeric, montant numeric,
  est_quittance boolean, date_emission date
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.name,
    (select string_agg(p.nom || coalesce(' ' || p.prenom, ''), ', ')
       from public.detentions d join public.persons p on p.id = d.person_id
      where d.lot_id = l.id and d.date_fin is null),
    (loc.nom || coalesce(' ' || loc.prenom, '')),
    (b2.address_line1 || coalesce(', ' || b2.address_line2, '') || ', ' || b2.postal_code || ' ' || b2.city),
    l.nom, a.periode, a.loyer_hc, a.charges, q.montant, q.est_quittance, q.date_emission
  from public.quittances q
  join public.appels_loyer a on a.id = q.appel_id
  join public.baux b on b.id = q.bail_id
  join public.lots l on l.id = b.lot_id
  join public.biens b2 on b2.id = l.bien_id
  join public.organizations o on o.id = q.organization_id
  join public.persons loc on loc.id = b.locataire_principal
  where q.id = p_quittance
    and (
      q.organization_id in (select public.org_ids_avec_roles(
        array['admin_agence','agent','proprietaire_direct']::public.membership_role[]))
      or loc.account_id = (select auth.uid())
    );
$$;
