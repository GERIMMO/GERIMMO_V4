-- Correctif : l'API Storage ne supprime que ce que le rôle peut LIRE.
-- L'exigence « document vivant » de ged_select s'appliquait aussi au Super
-- Admin : les fichiers purgés en base devenaient orphelins (introuvables pour
-- l'API, donc jamais supprimés physiquement). Le SA — opérateur de la purge —
-- voit désormais le bucket sans condition ; les rôles d'agence gardent
-- l'exigence du document vivant (aucun lien signé sur un document purgé).
-- Appliquée le 2026-07-28 sur « Gerimmo V4 » via MCP. Copie de référence.
drop policy ged_select on storage.objects;
create policy ged_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      (select public.is_super_admin())
      or (
        exists (
          select 1 from public.documents d
          where d.storage_path = name and d.purged_at is null
        )
        and (storage.foldername(name))[1] in (
          select o::text from public.org_ids_avec_roles(
            array['admin_agence','agent','proprietaire_direct']::public.membership_role[]) o)
      )
    )
  );
