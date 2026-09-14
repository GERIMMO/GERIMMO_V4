-- Référentiel 05.16 : les droits de supervision ne valent pas mandat de signature.
-- Un rôle métier réellement détenu dans l'organisation conserve ses droits.
create function public.peut_utiliser_signature_organisation(p_org uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select auth.jwt())->>'role'='service_role',false)
    or public.has_org_role(p_org,array['admin_agence','agent','proprietaire_direct']::public.membership_role[]);
$$;
revoke all on function public.peut_utiliser_signature_organisation(uuid) from public,anon;
grant execute on function public.peut_utiliser_signature_organisation(uuid) to authenticated,service_role;

create or replace function public.definir_signature_organisation(p_org uuid,p_path text)
returns void language plpgsql security definer set search_path='' as $$
declare v_ancienne text;
begin
  if not public.has_org_role(p_org,array['admin_agence','proprietaire_direct']::public.membership_role[]) then
    raise exception 'La signature est réservée au responsable de l''organisation, hors accès de supervision';
  end if;
  if p_path is not null and p_path not like p_org::text || '/signature-%' then raise exception 'Chemin de signature invalide'; end if;
  select signature_path into v_ancienne from public.organizations where id=p_org for update;
  if not found then raise exception 'Organisation introuvable'; end if;
  update public.organizations set signature_path=p_path where id=p_org;
  if v_ancienne is not null and v_ancienne is distinct from p_path then
    insert into public.purge_fichiers(storage_path) values(v_ancienne);
  end if;
end $$;
revoke all on function public.definir_signature_organisation(uuid,text) from public,anon;
grant execute on function public.definir_signature_organisation(uuid,text) to authenticated;

-- La même règle s'applique à un UPDATE direct de la table, pas seulement à la RPC.
create function public.proteger_signature_organisation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.signature_path is not distinct from old.signature_path then return new; end if;
  elsif new.signature_path is null then return new;
  end if;
  -- Les opérations internes de maintenance, sans utilisateur Auth, ne signent
  -- aucun document. Les clients authentifiés portent toujours auth.uid().
  if auth.uid() is not null and not public.has_org_role(new.id,array['admin_agence','proprietaire_direct']::public.membership_role[]) then
    raise exception 'La signature est réservée au responsable de l''organisation, hors accès de supervision';
  end if;
  return new;
end $$;
revoke all on function public.proteger_signature_organisation() from public,anon,authenticated;
create trigger proteger_signature_organisation before insert or update of signature_path on public.organizations
for each row execute function public.proteger_signature_organisation();

-- Empêcher le téléchargement ou le remplacement de l'image d'une signature
-- courante grâce au seul accès global ; les PDF historiques ne changent pas.
create function public.fichier_signature_autorise(p_path text,p_ecriture boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists (
    select 1 from public.organizations o where o.signature_path=p_path
      and not public.has_org_role(o.id,case when p_ecriture
        then array['admin_agence','proprietaire_direct']::public.membership_role[]
        else array['admin_agence','agent','proprietaire_direct']::public.membership_role[] end)
  );
$$;
revoke all on function public.fichier_signature_autorise(text,boolean) from public,anon;
grant execute on function public.fichier_signature_autorise(text,boolean) to authenticated;
create policy signature_lecture_metier on storage.objects as restrictive for select to authenticated
  using(bucket_id<>'documents' or public.fichier_signature_autorise(name,false));
create policy signature_depot_metier on storage.objects as restrictive for insert to authenticated
  with check(bucket_id<>'documents' or public.fichier_signature_autorise(name,true));
create policy signature_modification_metier on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'documents' or public.fichier_signature_autorise(name,true))
  with check(bucket_id<>'documents' or public.fichier_signature_autorise(name,true));
create policy signature_retrait_metier on storage.objects as restrictive for delete to authenticated
  using(bucket_id<>'documents' or public.fichier_signature_autorise(name,true));
