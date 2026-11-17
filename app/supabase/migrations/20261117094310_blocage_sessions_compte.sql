-- Un blocage GoTrue conserve ses sessions jusqu'à l'expiration des jetons.
-- La Data API et le stockage privé exigent désormais une nouvelle connexion après tout blocage.
create table gerimmo_session_interne.reconnexions_requises (
  compte_id uuid primary key references auth.users(id) on delete cascade,
  apres timestamptz not null
);
revoke all on gerimmo_session_interne.reconnexions_requises from public, anon, authenticated, service_role;

create function gerimmo_session_interne.enregistrer_blocage() returns trigger
language plpgsql security definer set search_path = '' as $$
declare seuil timestamptz;
begin
  if new.banned_until > clock_timestamp() then
    seuil := new.banned_until;
  elsif tg_op = 'UPDATE' and old.banned_until > clock_timestamp() then
    -- Rétablissement anticipé : une nouvelle session peut démarrer dès maintenant.
    seuil := clock_timestamp();
  else
    return new;
  end if;
  insert into gerimmo_session_interne.reconnexions_requises(compte_id, apres)
  values (new.id, seuil) on conflict (compte_id) do update set apres = excluded.apres;
  return new;
end;
$$;
revoke all on function gerimmo_session_interne.enregistrer_blocage() from public, anon, authenticated, service_role;

create trigger gerimmo_reconnexion_apres_blocage
after insert or update of banned_until on auth.users
for each row execute function gerimmo_session_interne.enregistrer_blocage();

-- Les comptes historiquement concernés gardent leurs documents, inscriptions et adhésions.
insert into gerimmo_session_interne.reconnexions_requises(compte_id, apres)
select id, banned_until from auth.users where banned_until is not null
on conflict (compte_id) do nothing;

create or replace function public.ma_session_active()
returns table (id uuid, cree_le timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.created_at
  from auth.sessions s
  join auth.users u on u.id = s.user_id
  left join gerimmo_session_interne.reconnexions_requises r on r.compte_id = u.id
  where s.user_id = (select auth.uid())
    and s.id = (select case
      when auth.jwt()->>'session_id' ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      then (auth.jwt()->>'session_id')::uuid else null end)
    and (s.not_after is null or s.not_after > now())
    and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
    and (r.compte_id is null or s.created_at > r.apres)
$$;
-- La politique SELECT existante protège déjà les téléchargements et nouveaux liens privés.
create policy session_active_pour_depot on storage.objects as restrictive
  for insert to authenticated with check ((select gerimmo_session_interne.session_valide()));
create policy session_active_pour_modification on storage.objects as restrictive
  for update to authenticated using ((select gerimmo_session_interne.session_valide()))
  with check ((select gerimmo_session_interne.session_valide()));
create policy session_active_pour_suppression on storage.objects as restrictive
  for delete to authenticated using ((select gerimmo_session_interne.session_valide()));
notify pgrst, 'reload schema';
