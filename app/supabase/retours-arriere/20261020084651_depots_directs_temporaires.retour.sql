-- Couper les nouveaux dépôts ; conserver le transit privé jusqu'à sa purge.
do $retour_atomique$
begin
 execute $retour$
 set local lock_timeout='10s';
 revoke insert(nom,mime,taille,empreinte) on public.depots_temporaires from authenticated;
 drop policy if exists transit_objet_depot on storage.objects;
 delete from supabase_migrations.schema_migrations where version='20261020084651';
 $retour$;
end $retour_atomique$;
