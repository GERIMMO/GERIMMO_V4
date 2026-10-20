-- Transit privé avant les contrôles métier existants. Aucun lien GED n'est créé ici.
create table if not exists public.depots_temporaires (
 id uuid primary key default gen_random_uuid(),
 compte_id uuid not null default auth.uid() references public.accounts(id),
 nom text not null check(length(nom) between 1 and 200),
 mime text not null check(mime in ('application/pdf','image/jpeg','image/png')),
 taille integer not null check(taille between 1 and 10485760),
 empreinte text not null check(empreinte ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),
 expire_le timestamptz not null default now()+interval '2 hours',
 chemin text generated always as (compte_id::text||'/'||id::text) stored unique
);
alter table public.depots_temporaires enable row level security;
revoke all on public.depots_temporaires from public,anon,authenticated;
grant select on public.depots_temporaires to authenticated;
grant insert(nom,mime,taille,empreinte) on public.depots_temporaires to authenticated;
grant all on public.depots_temporaires to service_role;
drop policy if exists depot_transit_lecture on public.depots_temporaires;
create policy depot_transit_lecture on public.depots_temporaires for select to authenticated
 using(compte_id=(select auth.uid()) and expire_le>now());
drop policy if exists depot_transit_reservation on public.depots_temporaires;
create policy depot_transit_reservation on public.depots_temporaires for insert to authenticated
 with check(compte_id=(select auth.uid()) and (
 exists(select 1 from public.memberships m where m.account_id=(select auth.uid()) and m.status='active')
 or public.artisan_identite_reelle() is not null or public.is_super_admin()));
drop policy if exists depot_transit_serveur on public.depots_temporaires;
create policy depot_transit_serveur on public.depots_temporaires for all to service_role using(true) with check(true);
create index if not exists depots_transit_compte_date on public.depots_temporaires(compte_id,created_at);
create index if not exists depots_transit_expiration on public.depots_temporaires(expire_le);

-- Schéma interne déjà inclus dans les sauvegardes et interdit aux clients.
create schema if not exists support_interne;
revoke all on schema support_interne from public,anon,authenticated;
create or replace function support_interne.borner_depots_temporaires() returns trigger
language plpgsql security invoker set search_path='' as $$
declare n integer; volume bigint;
begin
 if auth.uid() is null or new.compte_id is distinct from auth.uid() then raise exception 'Session requise'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.compte_id::text,182032));
 select count(*),coalesce(sum(taille),0) into n,volume from public.depots_temporaires
 where compte_id=new.compte_id and created_at>now()-interval '1 hour';
 if n>=20 or volume+new.taille>104857600 then raise exception 'Limite des dépôts atteinte, réessayez dans une heure'; end if;
 return new;
end $$;
revoke all on function support_interne.borner_depots_temporaires() from public,anon,authenticated;
drop trigger if exists borner_transit on public.depots_temporaires;
create trigger borner_transit before insert on public.depots_temporaires for each row execute function support_interne.borner_depots_temporaires();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('depots-temporaires','depots-temporaires',false,10485760,array['application/pdf','image/jpeg','image/png'])
 on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists transit_objet_depot on storage.objects;
create policy transit_objet_depot on storage.objects for insert to authenticated with check(
 bucket_id='depots-temporaires' and exists(select 1 from public.depots_temporaires d where d.chemin=storage.objects.name and d.compte_id=(select auth.uid()) and d.expire_le>now()));
drop policy if exists transit_objet_lecture on storage.objects;
create policy transit_objet_lecture on storage.objects for select to authenticated using(
 bucket_id='depots-temporaires' and exists(select 1 from public.depots_temporaires d where d.chemin=storage.objects.name and d.compte_id=(select auth.uid()) and d.expire_le>now()));
-- Pas de remplacement ni de suppression côté navigateur. Une réservation autorise
-- la signature jusqu'à expire_le ; la purge attend trois heures après expire_le
-- (dernier jeton de deux heures + une heure de marge), pour empêcher une réapparition.
