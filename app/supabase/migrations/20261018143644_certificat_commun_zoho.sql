-- Zoho émet un certificat commun : une seule entrée GED (empreinte unique),
-- liée à chaque signataire. Les preuves individuelles Youtrust sont inchangées.
create or replace function public.archiver_signature_bail(p_circuit uuid,p_jeton uuid,p_archives jsonb)
-- Le classement de signatures déjà reçues continue après une suspension.
-- Réglage limité à cet appel serveur ; PostgreSQL restaure la valeur à sa sortie.
returns uuid language plpgsql security invoker set search_path='' set gerimmo.systeme='on' as $$
declare
 v public.bail_signature_circuits; a jsonb; idx integer:=0; doc uuid; signe uuid;
 preuve_commune uuid; parties jsonb; racine text; chemin text; original public.documents;
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
   chemin:=racine||(case when idx=0 then 'contrat.pdf' when v.prestataire='zoho' then 'preuve-1.pdf' else 'preuve-'||idx||'.pdf' end);
   if a->>'path' is distinct from chemin
      or not coalesce((a->>'size')::bigint between 5 and 10485760,false) or not coalesce(a->>'hash' ~ '^[a-f0-9]{64}$',false) then raise exception 'Archive invalide'; end if;
   if v.prestataire='zoho' and idx>1 then
     if preuve_commune is null or a is distinct from (p_archives->1) then raise exception 'Certificat commun incohérent'; end if;
     doc:=preuve_commune;
   else
     insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
     values(v.organization_id,(case when idx=0 then 'bail' else 'autre' end)::public.document_type,
       case when idx=0 then original.titre||' — signé'
         when v.prestataire='zoho' then 'Certificat de réalisation — signature du bail'
         else 'Preuve de signature — '||(parties->(idx-1)->>'prenom')||' '||(parties->(idx-1)->>'nom') end,
       a->>'path','application/pdf',(a->>'size')::bigint,a->>'hash') returning id into doc;
     insert into public.document_liens(organization_id,document_id,entite,entite_id)
       select organization_id,doc,entite,entite_id from public.document_liens where document_id=v.document_id;
     if v.prestataire='zoho' and idx=1 then preuve_commune:=doc; end if;
   end if;
   if idx=0 then signe:=doc;
   else parties:=jsonb_set(parties,array[(idx-1)::text,'preuveDocumentId'],to_jsonb(doc::text)); end if;
   idx:=idx+1;
 end loop;
 update public.bail_signature_circuits set etat='termine',document_signe=signe,signataires=parties,erreur=null,updated_at=now() where id=v.id;
 insert into public.alerts(organization_id,type,criticite,titre,details)
 values(v.organization_id,'signature_retournee','normale','Bail signé par toutes les parties',
   jsonb_build_object('bail_id',v.bail_id,'document_id',signe,'circuit_id',v.id,'libelle','Contrat et preuves archivés — à vérifier avant activation'));
 insert into public.audit_log(account_id,organization_id,action,details)
 values(v.created_by,v.organization_id,'signature_bail_archivee',jsonb_build_object('circuit_id',v.id,'document_signe',signe,'preuves',idx-1));
 return signe;
end $$;
revoke all on function public.archiver_signature_bail(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.archiver_signature_bail(uuid,uuid,jsonb) to service_role;
