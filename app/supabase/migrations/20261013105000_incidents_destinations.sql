-- LOC002 : les chemins réservés d'une photo d'incident ne changent pas de
-- destination pendant leur retrait. Aucun fichier ordinaire n'est concerné.
-- La GED possède déjà sa garde (100000) et les pièces d'artisan leur préfixe
-- contraint artisans/<id>/. Fermer aussi l'UPDATE direct d'une signature par
-- un responsable réellement habilité, au-delà du contrôle de la RPC.
create function public.garde_destination_photo_incident()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.signature_path is not null and exists(
  select 1 from public.depots_photos_incident where storage_path=new.signature_path
 ) then
  raise exception 'Cette photo est réservée au signalement. Déposez une image de signature distincte';
 end if;
 return new;
end $$;
revoke all on function public.garde_destination_photo_incident() from public,anon,authenticated;
create trigger photo_incident_destination_signature before insert or update of signature_path on public.organizations
 for each row execute function public.garde_destination_photo_incident();
