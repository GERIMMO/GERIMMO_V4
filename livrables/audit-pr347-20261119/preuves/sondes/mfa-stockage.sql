\set ON_ERROR_STOP off
\set QUIET on
begin;
insert into auth.sessions(id,user_id,created_at) values ('34444444-2222-4333-8444-555555555555','6c3daa29-bde1-4651-91e6-8220ad0d7277',now());
select count(*) as objets_alpha_total from storage.objects where bucket_id='documents' and name like 'c14c3187-%';
\echo '--- sans facteur, aal1'
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"6c3daa29-bde1-4651-91e6-8220ad0d7277","role":"authenticated","session_id":"34444444-2222-4333-8444-555555555555","aal":"aal1"}',true) \gset x_
select count(*) as lisibles_sans_facteur from storage.objects where bucket_id='documents' and name like 'c14c3187-%';
reset role;
insert into auth.mfa_factors(id,user_id,status) values (gen_random_uuid(),'6c3daa29-bde1-4651-91e6-8220ad0d7277','verified');
\echo '--- facteur vérifié, session aal1'
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"6c3daa29-bde1-4651-91e6-8220ad0d7277","role":"authenticated","session_id":"34444444-2222-4333-8444-555555555555","aal":"aal1"}',true) \gset x_
select count(*) as lisibles_facteur_aal1 from storage.objects where bucket_id='documents' and name like 'c14c3187-%';
select gerimmo_session_interne.second_facteur_valide() as second_facteur_valide_aal1;
\echo '--- facteur vérifié, session aal2'
select set_config('request.jwt.claims','{"sub":"6c3daa29-bde1-4651-91e6-8220ad0d7277","role":"authenticated","session_id":"34444444-2222-4333-8444-555555555555","aal":"aal2"}',true) \gset x_
select count(*) as lisibles_facteur_aal2 from storage.objects where bucket_id='documents' and name like 'c14c3187-%';
reset role;
rollback;
