-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- Retour D11-A : aucune pièce ni fiche supprimée.

set local lock_timeout = '10s';
drop policy if exists ged_insert_artisan on storage.objects;

create policy ged_insert_artisan on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (
      (storage.foldername(name))[1] in (select o::text from public.orgs_de_mes_missions() o)
      or (storage.foldername(name))[1] in (select o::text from public.orgs_de_mes_sollicitations_ouvertes() o)
      or exists (select 1 from public.dossiers_de_mes_factures_a_deposer() d where name like d || '%')
      or (public.mon_artisan_id() is not null
          and name like 'artisans/' || public.mon_artisan_id()::text || '/%')
    )
  );


drop policy if exists ged_insert_locataire on storage.objects;
create policy ged_insert_locataire on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] in (
      select o::text from public.org_ids_avec_roles(
        array['locataire']::public.membership_role[]) o)
  );

drop function if exists public.ged_depot_artisan_autorise(text);
drop function if exists public.ged_depot_locataire_autorise(text);
delete from supabase_migrations.schema_migrations where version='20261020030000';
$instructions_retour$;
end $retour_atomique$;
