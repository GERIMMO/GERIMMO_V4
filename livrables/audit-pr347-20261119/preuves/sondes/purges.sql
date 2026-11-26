\set ON_ERROR_STOP off
\set QUIET on
begin;
select storage_path as cible, id as doc_alpha from public.documents where organization_id='c14c3187-1258-4e58-8822-368c6007e3fa' and storage_path like 'c14c3187-%' and purged_at is null order by created_at limit 1 \gset
select exists(select 1 from storage.objects where bucket_id='documents' and name=:'cible') as objet_alpha_present;
\echo '=== P1. Fiche malveillante ANTÉRIEURE à la correction (insérée sans déclencheurs), conservation 0 mois'
set local session_replication_role = replica;
insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte,retention_reference_date) values ('3c1d1e95-3570-400b-8012-44530be145b1','document_test','sonde historique',:'cible','application/pdf',1000,'h1',current_date-400) returning id as doc_histo \gset
set local session_replication_role = origin;
select count(*) as en_file_avant from public.purge_fichiers where storage_path=:'cible' and deleted_at is null;
select set_config('request.jwt.claims','',true) \gset x_
select (public.appliquer_retention())->>'documents_purges' as documents_purges;
select count(*) as fichier_alpha_mis_en_file from public.purge_fichiers where storage_path=:'cible' and deleted_at is null;
select purged_at is not null as fiche_historique_videe from public.documents where id=:'doc_histo';
select count(*) as refus_journalises from public.audit_log where action='purge_provenance_refusee' and details->>'document_id'=:'doc_histo';
\echo '=== P2. Doublon légitime dans Alpha : une fiche de test expire, une autre fiche vivante garde le même fichier'
insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte,retention_reference_date) values ('c14c3187-1258-4e58-8822-368c6007e3fa','document_test','doublon test',:'cible','application/pdf',1000,'h2',current_date-400) returning id as doc_doublon \gset
select (public.appliquer_retention())->>'documents_purges' as documents_purges_2;
select purged_at is not null as doublon_vide from public.documents where id=:'doc_doublon';
select count(*) as fichier_alpha_mis_en_file_2 from public.purge_fichiers where storage_path=:'cible' and deleted_at is null;
\echo '=== P3. Purge de nuit : entrée ancienne en file visant un fichier encore référencé'
insert into public.purge_fichiers(storage_path) values (:'cible') returning id as file_ref \gset
\echo '=== P4. Entrée en file pour un fichier orphelin (fiche supprimée), puis objet remplacé'
select o.name as orphelin from storage.objects o where o.bucket_id='documents' and not ged_securite_interne.fichier_reference(o.name) and o.name like 'c14c3187-%' limit 1 \gset
insert into public.purge_fichiers(storage_path) values (:'orphelin') returning id as file_orph \gset
insert into public.purge_fichiers(storage_path) values (:'orphelin') returning id as file_remplace \gset
update public.purge_fichiers set objet_id=gen_random_uuid() where id=:'file_remplace';
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true) \gset x_
select id=:'file_ref' as ref_reservee, id=:'file_orph' as orphelin_reserve, id=:'file_remplace' as remplace_reserve, objet_present from public.reserver_fichiers_purge(array[:'file_ref',:'file_orph',:'file_remplace']::uuid[]);
reset role;
\echo '=== P5. Un fichier réservé ne peut plus être rattaché à une fiche'
select set_config('request.jwt.claims','{"sub":"6c3daa29-bde1-4651-91e6-8220ad0d7277","role":"authenticated"}',true) \gset x_
savepoint r; insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values ('c14c3187-1258-4e58-8822-368c6007e3fa','justificatif','rattachement',:'orphelin','application/pdf',1000,'h5'); rollback to r;
rollback;
