-- LOC002/003 : reprises locataire, sans droit général de suppression Storage.
create table public.commandes_incidents_locataire (
 id uuid primary key, organization_id uuid not null references public.organizations(id),
 account_id uuid not null references public.accounts(id), requete jsonb not null,
 incident_id uuid not null references public.incidents(id), created_at timestamptz not null default now()
);
create index commandes_incidents_org on public.commandes_incidents_locataire(organization_id);
create index commandes_incidents_account on public.commandes_incidents_locataire(account_id);
create index commandes_incidents_incident on public.commandes_incidents_locataire(incident_id);
alter table public.commandes_incidents_locataire enable row level security;
revoke all on public.commandes_incidents_locataire from anon, authenticated;
grant select on public.commandes_incidents_locataire to authenticated;
create policy commandes_incidents_lecture on public.commandes_incidents_locataire for select to authenticated
 using(account_id=(select auth.uid()) and organization_id in(select public.org_ids_avec_roles(array['locataire']::public.membership_role[])));

create function public.declarer_mon_incident_reprise(p_org uuid,p_commande uuid,p_categorie text,p_description text,p_piece text,p_anciennete text,p_urgence public.incident_urgence)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.commandes_incidents_locataire; v_id uuid; v_requete jsonb;
begin
 if auth.uid() is null or p_commande is null or not(p_org in(select public.org_ids_avec_roles(array['locataire']::public.membership_role[]))) then raise exception 'Accès refusé'; end if;
 v_requete:=jsonb_build_array(p_categorie,nullif(trim(p_description),''),nullif(trim(p_piece),''),nullif(trim(p_anciennete),''),p_urgence);
 perform pg_advisory_xact_lock(hashtextextended(p_commande::text,131000));
 select * into v from public.commandes_incidents_locataire where id=p_commande;
 if found then
  if v.account_id<>auth.uid() or v.organization_id<>p_org then raise exception 'Accès refusé'; end if;
  if v.requete<>v_requete then raise exception 'Cette tentative est déjà enregistrée avec une autre saisie. Retrouvez le signalement dans vos demandes.'; end if;
  return jsonb_build_object('incident_id',v.incident_id,'rejoue',true);
 end if;
 v_id:=public.declarer_mon_incident(p_org,p_categorie,p_description,p_piece,p_anciennete,p_urgence);
 insert into public.commandes_incidents_locataire(id,organization_id,account_id,requete,incident_id) values(p_commande,p_org,auth.uid(),v_requete,v_id);
 return jsonb_build_object('incident_id',v_id,'rejoue',false);
end $$;
revoke all on function public.declarer_mon_incident_reprise(uuid,uuid,text,text,text,text,public.incident_urgence) from public,anon;
grant execute on function public.declarer_mon_incident_reprise(uuid,uuid,text,text,text,text,public.incident_urgence) to authenticated;

create table public.depots_photos_incident (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 account_id uuid not null references public.accounts(id), incident_id uuid not null references public.incidents(id),
 empreinte text not null check(empreinte~'^[0-9a-f]{64}$'), mime text not null check(mime in('image/jpeg','image/png')),
 taille bigint not null check(taille between 1 and 10485760), storage_path text not null unique,
 etat text not null default 'en_attente' check(etat in('en_attente','rattache','abandonne')),
 document_id uuid references public.documents(id), erreur text, created_at timestamptz not null default now(),
 check((etat='rattache')=(document_id is not null))
);
create index depots_photos_org on public.depots_photos_incident(organization_id);
create index depots_photos_account on public.depots_photos_incident(account_id);
create index depots_photos_incident_id on public.depots_photos_incident(incident_id);
create index depots_photos_document on public.depots_photos_incident(document_id);
create unique index depots_photos_reprise on public.depots_photos_incident(incident_id,account_id,empreinte) where etat<>'abandonne';
alter table public.depots_photos_incident enable row level security;
revoke all on public.depots_photos_incident from anon,authenticated;
grant select on public.depots_photos_incident to authenticated;
create policy depots_photos_lecture on public.depots_photos_incident for select to authenticated
 using(account_id=(select auth.uid()) and organization_id in(select public.org_ids_avec_roles(array['locataire']::public.membership_role[])));

-- Même déclarant et adhésion active que joindre_photo_incident ; aucune capacité gérant ajoutée.
create function public.verifier_declarant_photo(p_org uuid,p_incident uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not(p_org in(select public.org_ids_avec_roles(array['locataire']::public.membership_role[])))
 or not exists(select 1 from public.incidents i join public.persons p on p.id=i.declarant_person_id where i.id=p_incident and i.organization_id=p_org and p.account_id=auth.uid())
 or public.incident_hors_portefeuille(p_org,p_incident) then raise exception 'Accès refusé' using errcode='42501'; end if;
 perform 1 from public.incidents where id=p_incident for update;
end $$;
revoke all on function public.verifier_declarant_photo(uuid,uuid) from public,anon,authenticated;

create function public.preparer_photo_incident(p_org uuid,p_incident uuid,p_empreinte text,p_mime text,p_taille bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.depots_photos_incident; v_id uuid:=gen_random_uuid();
begin
 perform public.verifier_declarant_photo(p_org,p_incident);
 if p_empreinte is null or p_empreinte!~'^[0-9a-f]{64}$' or p_mime is null or p_mime not in('image/jpeg','image/png') or p_taille is null or p_taille not between 1 and 10485760 then raise exception 'Photo invalide'; end if;
 select * into v from public.depots_photos_incident where incident_id=p_incident and account_id=auth.uid() and empreinte=p_empreinte and etat<>'abandonne';
 if found then
  if v.mime<>p_mime or v.taille<>p_taille then raise exception 'La photo ne correspond pas au dépôt initial'; end if;
  return to_jsonb(v);
 end if;
 if exists(select 1 from public.incidents where id=p_incident and etat='clos') then raise exception 'Cet incident est clos'; end if;
 insert into public.depots_photos_incident(id,organization_id,account_id,incident_id,empreinte,mime,taille,storage_path)
 values(v_id,p_org,auth.uid(),p_incident,p_empreinte,p_mime,p_taille,p_org::text||'/incidents-reprise/'||auth.uid()::text||'/'||v_id::text||case when p_mime='image/jpeg' then '.jpg' else '.png' end) returning * into v;
 return to_jsonb(v);
end $$;
revoke all on function public.preparer_photo_incident(uuid,uuid,text,text,bigint) from public,anon;
grant execute on function public.preparer_photo_incident(uuid,uuid,text,text,bigint) to authenticated;

create function public.finaliser_photo_incident(p_depot uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v public.depots_photos_incident; v_document uuid;
begin
 select * into v from public.depots_photos_incident where id=p_depot and account_id=auth.uid();
 if not found then raise exception 'Accès refusé' using errcode='42501'; end if;
 perform public.verifier_declarant_photo(v.organization_id,v.incident_id);
 select * into v from public.depots_photos_incident where id=p_depot for update;
 if v.etat='rattache' then return jsonb_build_object('document_id',v.document_id,'rejoue',true); end if;
 if v.etat='abandonne' then return jsonb_build_object('erreur',v.erreur,'nettoyage',true); end if;
 begin
  v_document:=public.joindre_photo_incident(v.organization_id,v.incident_id,v.storage_path,v.mime,v.taille,v.empreinte);
 exception when others then
  -- L'échec du lien est connu en base, y compris après une réponse réseau perdue.
  update public.depots_photos_incident set etat='abandonne',erreur=sqlerrm where id=p_depot;
  return jsonb_build_object('erreur',sqlerrm,'nettoyage',true);
 end;
 update public.depots_photos_incident set etat='rattache',document_id=v_document where id=p_depot;
 return jsonb_build_object('document_id',v_document,'rejoue',false);
end $$;
revoke all on function public.finaliser_photo_incident(uuid) from public,anon;
grant execute on function public.finaliser_photo_incident(uuid) to authenticated;

-- La suppression n'est permise que pour CE dépôt abandonné et encore sans référence.
-- Les chemins sont générés par la base avant l'upload ; un client ne peut enregistrer
-- le chemin d'un autre fichier. Ni service_role ni droit global DELETE ne sont utilisés.
create function public.photo_incident_supprimable(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.depots_photos_incident p join storage.objects o on o.bucket_id='documents' and o.name=p.storage_path
 where p.storage_path=p_path and p.account_id=auth.uid() and p.etat='abandonne'
 and coalesce(nullif(to_jsonb(o)->>'owner_id',''),to_jsonb(o)->>'owner')=auth.uid()::text
 and p.organization_id in(select public.org_ids_avec_roles(array['locataire']::public.membership_role[])))
 and not exists(select 1 from public.documents where storage_path=p_path)
 and not exists(select 1 from public.organizations where signature_path=p_path)
 and not exists(select 1 from public.artisan_pieces where storage_path=p_path);
$$;
revoke all on function public.photo_incident_supprimable(text) from public,anon;
grant execute on function public.photo_incident_supprimable(text) to authenticated;
create policy depot_photo_incident_retrait on storage.objects for delete to authenticated using(bucket_id='documents' and public.photo_incident_supprimable(name));
create policy depot_photo_incident_lecture_retrait on storage.objects for select to authenticated using(bucket_id='documents' and public.photo_incident_supprimable(name));

-- Un dépôt abandonné ne peut plus devenir document pendant/après son retrait.
-- Le verrou commun ferme la course finalisation/retrait ; aucun DELETE SQL Storage.
create function public.garde_photo_incident_abandonnee()
returns trigger language plpgsql security definer set search_path='' as $$
declare v public.depots_photos_incident;
begin
 select * into v from public.depots_photos_incident where storage_path=new.storage_path for update;
 if found and v.etat='abandonne' then raise exception 'Ce dépôt a été abandonné : déposez à nouveau la photo'; end if;
 return new;
end $$;
revoke all on function public.garde_photo_incident_abandonnee() from public,anon,authenticated;
create trigger document_photo_incident_abandonnee before insert or update of storage_path on public.documents for each row execute function public.garde_photo_incident_abandonnee();

-- Les nouvelles tables suivent aussi l'arrêt des mutations en diagnostic.
create trigger diagnostic_artisan_lecture before insert or update or delete on public.commandes_incidents_locataire for each row execute function public.refuser_mutation_diagnostic_artisan();
create trigger diagnostic_artisan_lecture before insert or update or delete on public.depots_photos_incident for each row execute function public.refuser_mutation_diagnostic_artisan();
