-- RETOUR ARRIÈRE de 20261018143644_certificat_commun_zoho.sql (lot « supervision et signatures », 17-18/10/2026 ;
-- PR #203 : certificat commun Zoho, classement possible après suspension).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier défait une
-- migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md. Revenir d'abord au code
-- applicatif antérieur (PR #203 : commit b5f70e6).
--
-- Transaction EXTERNE : aucun begin/commit ici, la moindre erreur annule tout. Usage :
--   psql "$URL" -v ON_ERROR_STOP=1 --single-transaction -f 20261018143644_certificat_commun_zoho.retour.sql
-- Ordre : après le retour de 20261018185515 (garde ci-dessous), avant celui de 20261018100243.
--
-- CONSERVE : les certificats communs déjà archivés (une ligne documents « Certificat de réalisation — … » liée à
-- chaque signataire par signataires[*].preuveDocumentId) ; aucune table, aucune colonne, aucune ligne touchée.
-- RÉTABLIT : archiver_signature_bail dans sa forme de 20261018085521 (lignes 81-113 de cette migration, copiées
-- telles quelles, `create function` devenu `create or replace function`), avec ses droits (service_role seul).
-- RÉINTRODUIT : un circuit Zoho terminé après ce retour attend une preuve par signataire (preuve-<n>.pdf) et échoue
-- sur « Archives incomplètes » / « Archive invalide » tant que le code n'est pas revenu ; le classement d'un circuit
-- déjà signé redevient bloqué par la garde d'abonnement si l'organisation est suspendue (plus de
-- set_config('gerimmo.systeme','on',true)).
-- Rejouable : une fonction déjà sous sa forme de 20261018085521, ou absente, laisse le script sans effet.

set local lock_timeout = '10s';

do $archiver$
declare f text;
begin
  if to_regprocedure('public.archiver_signature_bail(uuid,uuid,jsonb)') is null then
    raise notice 'archiver_signature_bail : absente (retour de 20261018085521 déjà joué), rien à faire';
    return;
  end if;
  select pg_get_functiondef('public.archiver_signature_bail(uuid,uuid,jsonb)'::regprocedure) into f;
  -- Garde d'ordre : 20261018185515 réécrit cette fonction par ancre (bloc EDL, type du document d'origine).
  if strpos(f, 'v.modele') > 0 then
    raise exception 'Retour 20261018143644 refusé : jouer d''abord le retour de 20261018185515';
  end if;
  if strpos(f, 'v.prestataire') = 0 and strpos(f, 'gerimmo.systeme') = 0 then
    raise notice 'archiver_signature_bail : déjà sous sa forme de 20261018085521, rien à faire';
    return;
  end if;
  if (length(f) - length(replace(f, $x$v.prestataire='zoho'$x$, ''))) / length($x$v.prestataire='zoho'$x$) = 4
     and (length(f) - length(replace(f, 'gerimmo.systeme', ''))) / length('gerimmo.systeme') = 3 then
    execute $def$
create or replace function public.archiver_signature_bail(p_circuit uuid,p_jeton uuid,p_archives jsonb)
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
$def$;
    execute 'revoke all on function public.archiver_signature_bail(uuid,uuid,jsonb) from public,anon,authenticated';
    execute 'grant execute on function public.archiver_signature_bail(uuid,uuid,jsonb) to service_role';
    raise notice 'archiver_signature_bail : forme de 20261018085521 rétablie';
  else
    raise exception 'Retour 20261018143644 refusé : définition inattendue de archiver_signature_bail, aucune réécriture';
  end if;
end $archiver$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- Même transaction externe que le retour : la version n'est plus « appliquée », migrations.yml pourra la rejouer.
do $historique$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version in ('20261018143644');
  end if;
end $historique$;
