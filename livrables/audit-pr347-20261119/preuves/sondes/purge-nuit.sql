\set ON_ERROR_STOP off
\set QUIET on
begin;
select storage_path as cible from public.documents where organization_id='c14c3187-1258-4e58-8822-368c6007e3fa' and storage_path like 'c14c3187-%' and purged_at is null order by created_at limit 1 \gset
\set orph 'c14c3187-1258-4e58-8822-368c6007e3fa/orphelin-sonde-0000000000000.pdf'
\set orph2 'c14c3187-1258-4e58-8822-368c6007e3fa/orphelin-sonde-0000000000002.pdf'
insert into storage.objects(bucket_id,name) values ('documents',:'orph'),('documents',:'orph2');
insert into auth.sessions(id,user_id,created_at) values ('33333333-2222-4333-8444-555555555555','6c3daa29-bde1-4651-91e6-8220ad0d7277',now());
insert into public.purge_fichiers(storage_path) values (:'cible') returning id as file_ref \gset
insert into public.purge_fichiers(storage_path) values (:'orph') returning id as file_orph \gset
insert into public.purge_fichiers(storage_path) values (:'orph2') returning id as file_v1 \gset
update storage.objects set id=gen_random_uuid() where name=:'orph2';
\echo '=== P3 fichier encore référencé / P4 orphelin / P6 orphelin dont l''objet a été remplacé après mise en file'
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true) \gset x_
select count(*) filter (where id=:'file_ref') as p3_reference_reserve, count(*) filter (where id=:'file_orph') as p4_orphelin_reserve, count(*) filter (where id=:'file_v1') as p6_objet_remplace_reserve from public.reserver_fichiers_purge(array[:'file_ref',:'file_orph',:'file_v1']::uuid[]);
reset role;
\echo '=== P5. Le fichier orphelin réservé ne peut plus être rattaché à une nouvelle fiche, ni remplacé dans le stockage'
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"6c3daa29-bde1-4651-91e6-8220ad0d7277","role":"authenticated","session_id":"33333333-2222-4333-8444-555555555555","aal":"aal1"}',true) \gset x_
savepoint r; insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values ('c14c3187-1258-4e58-8822-368c6007e3fa','justificatif','rattachement',:'orph','application/pdf',1000,'h5'); rollback to r;
savepoint s; update storage.objects set metadata='{}'::jsonb where bucket_id='documents' and name=:'orph'; rollback to s;
savepoint t; delete from storage.objects where bucket_id='documents' and name=:'cible'; rollback to t;
reset role;
rollback;
