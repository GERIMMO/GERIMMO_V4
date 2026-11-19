-- SEC-1 : une fiche ne confère jamais des droits sur le fichier d'un autre client.
-- Les pièces globales artisans restent dans artisan_pieces (artisans/<id>/...),
-- pas dans documents. Les baux papier restent sous <organisation>/baux-papier/.
create schema if not exists ged_securite_interne;
revoke all on schema ged_securite_interne from public;
grant usage on schema ged_securite_interne to authenticated,service_role;

create function ged_securite_interne.chemin_organisation(p_org uuid,p_path text)
returns boolean language sql immutable set search_path='' as $$
 select p_org is not null and p_path is not null
   and split_part(p_path,'/',1)=p_org::text
   and length(p_path)>37 and p_path !~ '(^|/)(\.|\.\.)(/|$)'
   and p_path !~ '//|%|\\|[[:cntrl:]]' and right(p_path,1)<>'/'
$$;
revoke all on function ged_securite_interne.chemin_organisation(uuid,text) from public;
grant execute on function ged_securite_interne.chemin_organisation(uuid,text) to authenticated,service_role;

alter table public.purge_fichiers add column objet_id uuid, add column reserve_le timestamptz;
-- Identité de l'objet actuel, jamais modification/suppression de ses octets.
update public.purge_fichiers p set objet_id=o.id
 from storage.objects o where p.deleted_at is null and o.bucket_id='documents' and o.name=p.storage_path;

create function ged_securite_interne.fichier_reference(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from public.documents d where d.storage_path=p_path and d.purged_at is null)
 or exists(select from public.organizations o where o.signature_path=p_path)
 or exists(select from public.artisan_pieces a where a.storage_path=p_path)
 or exists(select from public.artisan_devis_preparations a where a.pdf_path=p_path)
$$;
create function ged_securite_interne.purge_reservee(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from public.purge_fichiers p where p.storage_path=p_path and p.reserve_le is not null)
$$;
revoke all on function ged_securite_interne.fichier_reference(text),ged_securite_interne.purge_reservee(text) from public;
grant execute on function ged_securite_interne.fichier_reference(text),ged_securite_interne.purge_reservee(text) to authenticated,service_role;

create function ged_securite_interne.verifier_document() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.storage_path is null then return new; end if;
 if not ged_securite_interne.chemin_organisation(new.organization_id,new.storage_path) then
   raise exception 'Le fichier n’appartient pas à cette organisation.' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(new.storage_path,191126));
 if ged_securite_interne.purge_reservee(new.storage_path) then
   raise exception 'Ce fichier est réservé pour suppression. Déposez une nouvelle copie.' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function ged_securite_interne.verifier_document() from public,authenticated;
create trigger documents_provenance_fichier before insert or update of organization_id,storage_path on public.documents
 for each row execute function ged_securite_interne.verifier_document();
create policy documents_provenance_lecture on public.documents as restrictive for select to authenticated
 using(storage_path is null or ged_securite_interne.chemin_organisation(organization_id,storage_path));
create policy documents_provenance_creation on public.documents as restrictive for insert to authenticated
 with check(storage_path is null or ged_securite_interne.chemin_organisation(organization_id,storage_path));

create function ged_securite_interne.verifier_lien() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select from public.documents d where d.id=new.document_id and d.organization_id=new.organization_id
   and (d.storage_path is null or ged_securite_interne.chemin_organisation(d.organization_id,d.storage_path))) then
   raise exception 'Le document n’appartient pas à ce dossier.' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function ged_securite_interne.verifier_lien() from public,authenticated;
create trigger document_liens_provenance before insert or update of organization_id,document_id on public.document_liens
 for each row execute function ged_securite_interne.verifier_lien();

-- Défense des données historiques : les fonctions privilégiées ne font pas confiance
-- à une ancienne fiche mal formée. Conserver les critères métier déjà présents.
do $$
declare signature text; definition text; ancre text;
begin
 foreach signature in array array['public.chemins_pieces_locataire()','public.chemins_fichiers_artisan()'] loop
   definition:=pg_get_functiondef(signature::regprocedure);
   ancre:='d.purged_at is null and d.storage_path is not null';
   if position(ancre in definition)=0 then raise exception 'Lecture documentaire inattendue : %',signature; end if;
   execute replace(definition,ancre,ancre||' and ged_securite_interne.chemin_organisation(d.organization_id,d.storage_path)');
 end loop;
 definition:=pg_get_functiondef('public.mon_document_locataire(uuid,uuid)'::regprocedure);
 ancre:='where d.id = p_doc and d.organization_id = p_org';
 if position(ancre in definition)=0 then raise exception 'Lecture locataire inattendue'; end if;
 execute replace(definition,ancre,ancre||' and (d.storage_path is null or ged_securite_interne.chemin_organisation(d.organization_id,d.storage_path))');
 definition:=pg_get_functiondef('public.log_document_access(uuid,text)'::regprocedure);
 ancre:='where d.id = doc;';
 if position(ancre in definition)=0 then raise exception 'Journal documentaire inattendu'; end if;
 execute replace(definition,ancre,'where d.id = doc and (d.storage_path is null or ged_securite_interne.chemin_organisation(d.organization_id,d.storage_path));');
 -- Le point commun de toutes les règles de conservation : ne pas vider la
 -- fiche étrangère et ne pas mettre son chemin en file. Trace sans chemin privé.
 definition:=pg_get_functiondef('public.purger_document_conservation(uuid,text,date)'::regprocedure);
 ancre:='  if not found then return false; end if;';
 if position(ancre in definition)=0 then raise exception 'Conservation inattendue'; end if;
 execute replace(definition,ancre,ancre||$protection$
  if d.storage_path is not null then
    perform pg_advisory_xact_lock(hashtextextended(d.storage_path,191126));
    if not ged_securite_interne.chemin_organisation(d.organization_id,d.storage_path) then
      insert into public.audit_log(organization_id,action,details)
      values(d.organization_id,'purge_provenance_refusee',jsonb_build_object('document_id',d.id));
      return false;
    end if;
  end if;
$protection$);
 definition:=pg_get_functiondef('public.purger_document_conservation(uuid,text,date)'::regprocedure);
 ancre:='if d.storage_path is not null then' || E'\n    insert into public.purge_fichiers';
 if position(ancre in definition)=0 then raise exception 'Mise en file de conservation inattendue'; end if;
 execute replace(definition,ancre,$protection$if d.storage_path is not null
    and not exists(select from public.documents autre where autre.storage_path=d.storage_path and autre.id<>d.id and autre.purged_at is null) then
    insert into public.purge_fichiers$protection$);
end $$;

-- L'identifiant Storage est figé à l'entrée en file. Un chemin réutilisé ne
-- désigne pas l'ancien objet ; cette file ne donnera pas droit de le supprimer.
create function ged_securite_interne.identifier_purge() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.storage_path,191126));
 select id into new.objet_id from storage.objects where bucket_id='documents' and name=new.storage_path;
 new.reserve_le:=null;
 return new;
end $$;
revoke all on function ged_securite_interne.identifier_purge() from public,authenticated;
create trigger purge_identite before insert on public.purge_fichiers
 for each row execute function ged_securite_interne.identifier_purge();
create function ged_securite_interne.verifier_reference_reservee() returns trigger
language plpgsql security definer set search_path='' as $$
declare chemin text := to_jsonb(new)->>tg_argv[0];
begin
 if chemin is null then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(chemin,191126));
 if ged_securite_interne.purge_reservee(chemin) then
   raise exception 'Ce fichier est réservé pour suppression. Déposez une nouvelle copie.' using errcode='42501';
 end if;
 if tg_table_name='organizations' then
   if not ged_securite_interne.chemin_organisation(new.id,chemin) then
     raise exception 'Le fichier n’appartient pas à cette organisation.' using errcode='42501';
   end if;
 end if;
 return new;
end $$;
revoke all on function ged_securite_interne.verifier_reference_reservee() from public,authenticated;
create trigger signature_provenance before insert or update of signature_path on public.organizations
 for each row execute function ged_securite_interne.verifier_reference_reservee('signature_path');
create trigger artisan_piece_provenance before insert or update of storage_path on public.artisan_pieces
 for each row execute function ged_securite_interne.verifier_reference_reservee('storage_path');
create trigger devis_pdf_provenance before insert or update of pdf_path on public.artisan_devis_preparations
 for each row execute function ged_securite_interne.verifier_reference_reservee('pdf_path');
-- L'API utilisateur ne peut ni substituer un chemin, ni se fabriquer une réservation.
revoke update on public.purge_fichiers from authenticated;
grant update(deleted_at) on public.purge_fichiers to authenticated;

create function public.reserver_fichiers_purge(p_ids uuid[])
returns table(id uuid,storage_path text,queued_at timestamptz,objet_present boolean)
language plpgsql security definer set search_path='' as $$
declare p public.purge_fichiers; objet uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' and not public.is_super_admin() then
   raise exception 'Réservé au traitement de purge ou au superviseur vérifié.' using errcode='42501';
 end if;
 if public.verifier_arret_supervision('purge',null) is distinct from true then return; end if;
 if coalesce(cardinality(p_ids),0)>500 then raise exception 'Lot de purge trop grand'; end if;
 for p in select q.* from public.purge_fichiers q where q.id=any(p_ids) and q.deleted_at is null order by q.id for update skip locked loop
   perform pg_advisory_xact_lock(hashtextextended(p.storage_path,191126));
   if ged_securite_interne.fichier_reference(p.storage_path) then continue; end if;
   select o.id into objet from storage.objects o where o.bucket_id='documents' and o.name=p.storage_path;
   if objet is distinct from p.objet_id and objet is not null then continue; end if;
   update public.purge_fichiers q set reserve_le=coalesce(q.reserve_le,now()) where q.id=p.id;
   id:=p.id;storage_path:=p.storage_path;queued_at:=p.queued_at;
   objet_present:=objet is not null;
   return next;
 end loop;
end $$;
revoke all on function public.reserver_fichiers_purge(uuid[]) from public,anon;
grant execute on function public.reserver_fichiers_purge(uuid[]) to authenticated,service_role;

-- Les politiques métier restent nécessaires. Ces restrictions s'y ajoutent.
create policy fichier_vivant_non_supprimable on storage.objects as restrictive for delete to authenticated
 using(bucket_id<>'documents' or not ged_securite_interne.fichier_reference(name));
create policy fichier_reserve_non_remplacable on storage.objects as restrictive for update to authenticated
 using(bucket_id<>'documents' or not ged_securite_interne.purge_reservee(name))
 with check(bucket_id<>'documents' or not ged_securite_interne.purge_reservee(name));
create policy fichier_reserve_non_recree on storage.objects as restrictive for insert to authenticated
 with check(bucket_id<>'documents' or not ged_securite_interne.purge_reservee(name));

notify pgrst,'reload schema';
