begin;
select storage_path as cible from public.documents where organization_id='c14c3187-1258-4e58-8822-368c6007e3fa' and storage_path like 'c14c3187-%' and purged_at is null order by created_at limit 1 \gset
select exists(select 1 from storage.objects where bucket_id='documents' and name=:'cible') as objet_alpha_present;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"802e3fdc-725b-48f2-b842-528d971195a5","role":"authenticated","session_id":"1a8193a7-3768-404d-b0d3-f56fb7c84b99","aal":"aal1"}', true) \gset ignore_
select exists(select from public.ma_session_active()) as session_active;
savepoint s1;
insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte,retention_reference_date)
 values ('3c1d1e95-3570-400b-8012-44530be145b1','document_test','sonde chemin croisé',:'cible','application/pdf',1000,'sonde-'||gen_random_uuid(), current_date - 400) returning id as doc_sonde \gset
select :'doc_sonde' as fiche_creee_par_le_proprietaire_PD;
-- Lecture du fichier d'Alpha par le propriétaire PD au travers de la politique de stockage :
select count(*) as objets_alpha_lisibles_par_PD from storage.objects where bucket_id='documents' and name=:'cible';
reset role;
-- 2. La conservation : que fait appliquer_retention de cette fiche ?

select count(*) as en_file_avant from public.purge_fichiers where storage_path=:'cible' and deleted_at is null;
select pg_get_function_identity_arguments('public.appliquer_retention'::regproc) as args;
select set_config('request.jwt.claims', '', true) \gset ignore_
select public.appliquer_retention();
select count(*) as fichier_alpha_mis_en_file_de_suppression from public.purge_fichiers where storage_path=:'cible' and deleted_at is null;
select purged_at is not null as fiche_sonde_purgee from public.documents where id=:'doc_sonde';
select purged_at is not null as fiche_alpha_originale_purgee from public.documents where organization_id='c14c3187-1258-4e58-8822-368c6007e3fa' and storage_path=:'cible';
rollback;
