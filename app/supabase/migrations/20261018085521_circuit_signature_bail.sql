-- Circuit commun de signature du bail. Les appels externes restent côté serveur.
-- Aucun droit d'écriture API pour les utilisateurs, aucun accès anonyme.
create table public.bail_signature_circuits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  bail_id uuid,
  document_id uuid not null,
  created_by uuid not null references auth.users(id),
  etat text not null default 'pret' check (etat in ('pret','preparation','en_cours','a_verifier','termine','annule','refuse','expire')),
  environnement text not null check (environnement in ('sandbox','production')),
  empreinte text not null check (empreinte ~ '^[a-f0-9]{64}$'),
  pdf_hash text not null check (pdf_hash ~ '^[a-f0-9]{64}$'),
  signataires jsonb not null check (jsonb_typeof(signataires)='array' and jsonb_array_length(signataires) between 2 and 100),
  annexes jsonb not null default '[]' check (jsonb_typeof(annexes)='array' and jsonb_array_length(annexes)<=49),
  external_request_id text unique,
  external_document_id text,
  document_signe uuid,
  erreur text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expire_le timestamptz not null default now()+interval '30 days',
  verrou_jeton uuid,
  verrou_jusqua timestamptz,
  foreign key (bail_id,organization_id) references public.baux(id,organization_id) on delete set null (bail_id),
  foreign key (document_id,organization_id) references public.documents(id,organization_id),
  foreign key (document_signe,organization_id) references public.documents(id,organization_id)
);
create unique index bail_signature_un_circuit_actif on public.bail_signature_circuits(bail_id)
  where etat in ('pret','preparation','en_cours','a_verifier');
create index bail_signature_org on public.bail_signature_circuits(organization_id,created_at desc);
create index bail_signature_bail on public.bail_signature_circuits(bail_id,organization_id);
create index bail_signature_document on public.bail_signature_circuits(document_id,organization_id);
create index bail_signature_signe on public.bail_signature_circuits(document_signe,organization_id);
create index bail_signature_auteur on public.bail_signature_circuits(created_by);
alter table public.bail_signature_circuits enable row level security;
revoke all on public.bail_signature_circuits from anon,authenticated;
grant select on public.bail_signature_circuits to authenticated;
grant all on public.bail_signature_circuits to service_role;
create policy signature_bail_lecture on public.bail_signature_circuits for select to authenticated
  using (public.has_org_role(organization_id,array['proprietaire_direct','admin_agence','agent']::public.membership_role[])
    and exists(select 1 from public.baux b where b.id=bail_id));
create policy signature_bail_serveur on public.bail_signature_circuits for all to service_role using(true) with check(true);

-- Réservation exclusive avant le premier appel externe. Les relances d'un
-- double clic ne peuvent pas déclencher deux invitations ni deux facturations.
create function public.reserver_envoi_signature_bail(p_circuit uuid, p_actor uuid)
returns public.bail_signature_circuits language plpgsql security invoker set search_path='' as $$
declare v public.bail_signature_circuits;
begin
  select * into v from public.bail_signature_circuits where id=p_circuit for update;
  if not found or not exists(select 1 from public.memberships m where m.account_id=p_actor
    and m.organization_id=v.organization_id and m.status='active' and m.role='proprietaire_direct') then
    raise exception 'Accès refusé' using errcode='42501';
  end if;
  if v.etat <> 'pret' then raise exception 'Ce circuit a déjà été envoyé ou doit être vérifié.'; end if;
  if exists(select 1 from public.demandes_signature d join public.document_liens dl on dl.document_id=d.document_id
    join public.documents doc on doc.id=d.document_id
    where dl.entite='bail' and dl.entite_id=v.bail_id and doc.type='bail' and d.signee_le is null) then
    raise exception 'Annulez les demandes manuelles en attente avant cet envoi.';
  end if;
  update public.bail_signature_circuits set etat='preparation',updated_at=now(),erreur=null
    where id=p_circuit returning * into v;
  insert into public.audit_log(account_id,organization_id,action,details)
    values(p_actor,v.organization_id,'signature_bail_envoi_demande',jsonb_build_object('circuit_id',v.id,'bail_id',v.bail_id,'environnement',v.environnement));
  return v;
end $$;
revoke all on function public.reserver_envoi_signature_bail(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserver_envoi_signature_bail(uuid,uuid) to service_role;

create function public.verrouiller_signature_bail(p_circuit uuid,p_jeton uuid)
returns boolean language sql security invoker set search_path='' as $$
 with verrou as (
   update public.bail_signature_circuits set verrou_jeton=p_jeton,verrou_jusqua=now()+interval '10 minutes'
   where id=p_circuit and (verrou_jusqua is null or verrou_jusqua<now()) returning id
 ) select exists(select 1 from verrou);
$$;
revoke all on function public.verrouiller_signature_bail(uuid,uuid) from public,anon,authenticated;
grant execute on function public.verrouiller_signature_bail(uuid,uuid) to service_role;

-- Archives déterministes, preuve de CHAQUE signataire, une seule transaction.
create function public.archiver_signature_bail(p_circuit uuid,p_jeton uuid,p_archives jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v public.bail_signature_circuits; a jsonb; idx integer:=0; doc uuid; signe uuid; parties jsonb; racine text; original public.documents;
begin
 select * into v from public.bail_signature_circuits where id=p_circuit for update;
 if not found then raise exception 'Circuit inconnu'; end if;
 if v.document_signe is not null then return v.document_signe; end if;
 if p_jeton is null or v.verrou_jeton is distinct from p_jeton or v.verrou_jusqua is null or v.verrou_jusqua<now() then raise exception 'Verrou expiré'; end if;
 if not coalesce(jsonb_typeof(p_archives)='array' and jsonb_array_length(p_archives)=jsonb_array_length(v.signataires)+1,false) then raise exception 'Archives incomplètes'; end if;
 if exists(select 1 from jsonb_array_elements(v.signataires) s where s->>'statut' is distinct from 'signed') then raise exception 'Toutes les parties doivent avoir signé'; end if;
 select * into strict original from public.documents where id=v.document_id and organization_id=v.organization_id;
 parties:=v.signataires;
 racine:=v.organization_id||'/signature-bail/'||v.id||'/';
 for a in select value from jsonb_array_elements(p_archives) loop
   if a->>'path' is distinct from (racine||(case when idx=0 then 'contrat.pdf' else 'preuve-'||idx||'.pdf' end))
      or not coalesce((a->>'size')::bigint between 5 and 10485760,false) or not coalesce(a->>'hash' ~ '^[a-f0-9]{64}$',false) then raise exception 'Archive invalide'; end if;
   insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
   values(v.organization_id,(case when idx=0 then 'bail' else 'autre' end)::public.document_type,
     case when idx=0 then original.titre||' — signé' else 'Preuve de signature — '||(parties->(idx-1)->>'prenom')||' '||(parties->(idx-1)->>'nom') end,
     a->>'path','application/pdf',(a->>'size')::bigint,a->>'hash') returning id into doc;
   insert into public.document_liens(organization_id,document_id,entite,entite_id)
     select organization_id,doc,entite,entite_id from public.document_liens where document_id=v.document_id;
   if idx=0 then signe:=doc;
   else parties:=jsonb_set(parties,array[(idx-1)::text,'preuveDocumentId'],to_jsonb(doc::text)); end if;
   idx:=idx+1;
 end loop;
 update public.bail_signature_circuits set etat='termine',document_signe=signe,signataires=parties,erreur=null,updated_at=now() where id=v.id;
 insert into public.alerts(organization_id,type,criticite,titre,details)
 values(v.organization_id,'signature_retournee','normale','Bail signé par toutes les parties',
   jsonb_build_object('bail_id',v.bail_id,'document_id',signe,'circuit_id',v.id,'libelle','Contrat et preuves archivés — à vérifier avant activation'));
 insert into public.audit_log(account_id,organization_id,action,details) values(v.created_by,v.organization_id,'signature_bail_archivee',jsonb_build_object('circuit_id',v.id,'document_signe',signe,'preuves',idx-1));
 return signe;
end $$;
revoke all on function public.archiver_signature_bail(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.archiver_signature_bail(uuid,uuid,jsonb) to service_role;

-- La version envoyée ne peut être remplacée ou supprimée pendant la signature.
create function public.proteger_document_en_signature_bail()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.bail_signature_circuits c where (c.document_id=old.id or exists(select 1 from jsonb_array_elements(c.annexes) a where a->>'id'=old.id::text))
   and c.etat in ('preparation','en_cours','a_verifier')) then
   raise exception 'Annulez le circuit de signature avant de modifier ou supprimer ce document.';
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function public.proteger_document_en_signature_bail() from public,anon,authenticated;
create trigger document_signature_bail_verrou before update or delete on public.documents
for each row execute function public.proteger_document_en_signature_bail();

-- Réutilise les contrôles métier de mise en location dans la même transaction.
create function public.activer_bail_signature_electronique(p_circuit uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v public.bail_signature_circuits;
begin
 select * into v from public.bail_signature_circuits where id=p_circuit for update;
 if not found or not public.has_org_role(v.organization_id,array['proprietaire_direct']::public.membership_role[]) then raise exception 'Accès refusé' using errcode='42501'; end if;
 if v.etat<>'termine' or v.document_signe is null or v.environnement<>'production' then raise exception 'Un contrat réellement signé et archivé est nécessaire.'; end if;
 if not exists(select 1 from public.baux b where b.id=v.bail_id and b.etat='brouillon') then raise exception 'Le bail n’est plus un brouillon.'; end if;
 update public.baux set document_signe=v.document_signe where id=v.bail_id;
 perform public.activer_bail(v.bail_id);
end $$;
revoke all on function public.activer_bail_signature_electronique(uuid) from public,anon;
grant execute on function public.activer_bail_signature_electronique(uuid) to authenticated;

create function public.garder_bail_en_signature()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.bail_signature_circuits where bail_id=old.id and etat in ('preparation','en_cours','a_verifier')) then
  raise exception 'Annulez le circuit de signature avant de supprimer le bail.';
 end if;
 update public.bail_signature_circuits set etat='annule' where bail_id=old.id and etat='pret';
 return old;
end $$;
revoke all on function public.garder_bail_en_signature() from public,anon,authenticated;
create trigger bail_signature_garde_suppression before delete on public.baux for each row execute function public.garder_bail_en_signature();

create function public.garder_signature_manuelle_bail()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.document_liens dl join public.bail_signature_circuits c on c.bail_id=dl.entite_id
   where dl.document_id=new.document_id and dl.entite='bail' and c.etat in ('preparation','en_cours','a_verifier')) then
  raise exception 'Un circuit électronique est en cours pour ce bail. Annulez-le avant de demander une signature manuelle.';
 end if;
 return new;
end $$;
revoke all on function public.garder_signature_manuelle_bail() from public,anon,authenticated;
create trigger signature_manuelle_bail_garde before insert on public.demandes_signature for each row execute function public.garder_signature_manuelle_bail();

-- Restreint les policies Storage existantes sans accorder un accès nouveau.
create function public.fichier_en_signature_bail(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.bail_signature_circuits c join public.documents d on d.id=c.document_id
   where c.etat in ('preparation','en_cours','a_verifier')
     and public.has_org_role(c.organization_id,array['proprietaire_direct','admin_agence','agent']::public.membership_role[])
     and (d.storage_path=p_path or exists(select 1 from jsonb_array_elements(c.annexes) a where a->>'storage_path'=p_path)));
$$;
revoke all on function public.fichier_en_signature_bail(text) from public,anon;
grant execute on function public.fichier_en_signature_bail(text) to authenticated;
create policy signature_bail_fichier_update on storage.objects as restrictive for update to authenticated
  using(bucket_id<>'documents' or not public.fichier_en_signature_bail(name))
  with check(bucket_id<>'documents' or not public.fichier_en_signature_bail(name));
create policy signature_bail_fichier_delete on storage.objects as restrictive for delete to authenticated
  using(bucket_id<>'documents' or not public.fichier_en_signature_bail(name));

-- Même garde que les autres tables d'organisation, posée sans reverrouiller
-- toutes les tables. Une suspension bloque la préparation et le nouvel envoi.
create trigger abonnement_bail_signature_circuits
 before insert or update or delete on public.bail_signature_circuits
 for each row execute function public.refuser_ecriture_si_fermee();
create trigger traversee_lecture_seule
 before insert or update or delete on public.bail_signature_circuits
 for each row execute function support_interne.garder_ecriture_traversee();

-- Le serveur doit néanmoins suivre un circuit déjà engagé et permettre son
-- annulation. Cette exception reste attachée à la garde commune si elle est
-- reposée plus tard ; ni nouveau circuit ni retour à l'état prêt ne passe.
do $suivi_signature$
declare d text;
 ancre constant text := $a$  v_org := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;$a$;
 ajout constant text := $b$
  -- Suivi serveur des signatures déjà engagées (18/10/2026).
  if tg_table_name = 'bail_signature_circuits' and tg_op = 'UPDATE' and auth.role() = 'service_role' then
    if old.etat <> 'pret' and new.etat <> 'pret'
      and to_jsonb(old) - array['etat','signataires','external_request_id','external_document_id','document_signe','erreur','updated_at','verrou_jeton','verrou_jusqua']
        = to_jsonb(new) - array['etat','signataires','external_request_id','external_document_id','document_signe','erreur','updated_at','verrou_jeton','verrou_jusqua'] then
      return new;
    end if;
    if old.etat = 'pret' and new.etat = 'annule'
      and to_jsonb(old) - array['etat','erreur','updated_at'] = to_jsonb(new) - array['etat','erreur','updated_at'] then
      return new;
    end if;
  end if;$b$;
begin
 select pg_get_functiondef('public.refuser_ecriture_si_fermee()'::regprocedure) into d;
 if strpos(d,'Suivi serveur des signatures déjà engagées (18/10/2026)')=0 then
   if (length(d)-length(replace(d,ancre,'')))<>length(ancre) then raise exception 'Garde abonnement : ancre inattendue'; end if;
   -- Préserve le bloc ancre + exception artisan utilisé par son retour arrière.
   execute replace(d,ancre,ajout||E'\n'||ancre);
 end if;
end $suivi_signature$;
