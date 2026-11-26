begin;
select storage_path as cible from public.documents where organization_id='c14c3187-1258-4e58-8822-368c6007e3fa' and storage_path like 'c14c3187-%' and purged_at is null order by created_at limit 1 \gset
insert into auth.sessions(id, user_id, created_at) values ('11111111-2222-4333-8444-555555555555','0160606f-3704-4812-a1ab-8cb2419c2c8f', now());
-- 1. Le propriétaire PD crée une pièce « justificatif » pointant vers le fichier d'Alpha et la lie à son locataire.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"802e3fdc-725b-48f2-b842-528d971195a5","role":"authenticated","session_id":"1a8193a7-3768-404d-b0d3-f56fb7c84b99","aal":"aal1"}', true) \gset ignore_
insert into public.documents(organization_id,type,titre,storage_path,mime_type,taille_octets,empreinte)
 values ('3c1d1e95-3570-400b-8012-44530be145b1','justificatif','sonde lecture croisée',:'cible','application/pdf',1000,'sonde-'||gen_random_uuid()) returning id as doc_sonde \gset
insert into public.document_liens(document_id, organization_id, entite, entite_id) values (:'doc_sonde','3c1d1e95-3570-400b-8012-44530be145b1','personne','7bae62be-369e-4778-bc61-fbf58aae0e4b');
select count(*) as lisible_par_proprietaire_PD from storage.objects where bucket_id='documents' and name=:'cible';
-- 2. Le locataire PD lit-il le fichier d'Alpha ?
select set_config('request.jwt.claims', '{"sub":"0160606f-3704-4812-a1ab-8cb2419c2c8f","role":"authenticated","session_id":"11111111-2222-4333-8444-555555555555","aal":"aal1"}', true) \gset ignore_
select exists(select from public.ma_session_active()) as session_locataire_active;
select count(*) as fichier_alpha_lisible_par_locataire_PD from storage.objects where bucket_id='documents' and name=:'cible';
rollback;
