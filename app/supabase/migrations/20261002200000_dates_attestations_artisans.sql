-- Ne modifie pas les attestations historiques ; contrôle les nouveaux dépôts.
create or replace function public.controler_dates_attestation_artisan()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.emise_le > (current_timestamp at time zone 'Europe/Paris')::date then
    raise exception 'La date d’émission ne peut pas être dans le futur';
  end if;
  if new.expire_le < new.emise_le then
    raise exception 'La fin de validité ne peut pas précéder la date d’émission';
  end if;
  return new;
end;
$$;
revoke all on function public.controler_dates_attestation_artisan() from public, anon, authenticated;
create trigger controler_dates_attestation_artisan
before insert or update of emise_le, expire_le on public.artisan_pieces
for each row execute function public.controler_dates_attestation_artisan();
