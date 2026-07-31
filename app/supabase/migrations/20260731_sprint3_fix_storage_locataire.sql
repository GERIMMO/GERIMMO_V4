-- Correctif Sprint 3 — la policy de stockage locataire interrogeait
-- public.memberships SOUS RLS (le locataire ne voit pas forcément sa propre
-- adhésion) → sous-requête vide → upload de l'attestation refusé.
-- On passe par org_ids_avec_roles (SECURITY DEFINER), comme la policy agence.

drop policy ged_insert_locataire on storage.objects;

create policy ged_insert_locataire on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select o::text from public.org_ids_avec_roles(
        array['locataire']::public.membership_role[]) o)
  );
