\set ON_ERROR_STOP off
\set QUIET on
begin;
select storage_path as cible, id as doc_alpha from public.documents where organization_id='c14c3187-1258-4e58-8822-368c6007e3fa' and storage_path like 'c14c3187-%' and purged_at is null order by created_at limit 1 \gset
insert into auth.sessions(id,user_id,created_at) values ('31111111-2222-4333-8444-555555555555','45840545-f9e6-4408-ad8a-38e1674a36e5',now()),('32222222-2222-4333-8444-555555555555','179da156-be90-4abb-9dba-33705a7222ca',now());
\echo '=== 1. Propriétaire PD : fiche document_test visant le fichier d''Alpha'
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"45840545-f9e6-4408-ad8a-38e1674a36e5","role":"authenticated","session_id":"31111111-2222-4333-8444-555555555555","aal":"aal1"}',true) \gset x_
savepoint a; insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte,retention_reference_date) values ('3c1d1e95-3570-400b-8012-44530be145b1','document_test','sonde',:'cible','application/pdf',1000,'s1',current_date-400); rollback to a;
\echo '=== 2. Même chose en justificatif'
savepoint b; insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values ('3c1d1e95-3570-400b-8012-44530be145b1','justificatif','sonde',:'cible','application/pdf',1000,'s2'); rollback to b;
\echo '=== 3. Chemin piégé dans son propre préfixe (../)'
savepoint c; insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values ('3c1d1e95-3570-400b-8012-44530be145b1','justificatif','sonde','3c1d1e95-3570-400b-8012-44530be145b1/../'||:'cible','application/pdf',1000,'s3'); rollback to c;
\echo '=== 4. Fiche légitime puis UPDATE de son chemin vers Alpha'
savepoint d; insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte) values ('3c1d1e95-3570-400b-8012-44530be145b1','justificatif','sonde','3c1d1e95-3570-400b-8012-44530be145b1/sonde-legitime.pdf','application/pdf',1000,'s4') returning id as doc_pd \gset
\echo 'fiche légitime créée'
update public.documents set storage_path=:'cible' where id=:'doc_pd';
rollback to d;
\echo '=== 5. Lien d''un document d''Alpha vers la fiche de son locataire'
savepoint e; insert into public.document_liens(document_id,organization_id,entite,entite_id) values (:'doc_alpha','3c1d1e95-3570-400b-8012-44530be145b1','personne','e8854b16-dc12-4313-b436-89fc4feccd1f'); rollback to e;
\echo '=== 6. Mise en file directe du chemin d''Alpha'
savepoint f; insert into public.purge_fichiers(storage_path) values (:'cible'); rollback to f;
savepoint g; update public.purge_fichiers set storage_path=:'cible' where true; rollback to g;
\echo '=== 7. Appel de reserver_fichiers_purge par un propriétaire'
savepoint h; select * from public.reserver_fichiers_purge(array[gen_random_uuid()]); rollback to h;
\echo '=== 8. Lecture objet Alpha par le propriétaire PD'
select count(*) as objets_alpha_lisibles from storage.objects where bucket_id='documents' and name=:'cible';
reset role;
rollback;
