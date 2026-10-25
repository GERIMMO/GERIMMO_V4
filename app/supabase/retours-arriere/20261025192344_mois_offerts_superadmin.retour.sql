-- Refuse de perdre un cadeau réel. Les crédits Stripe ne se remboursent pas par un retour SQL.
begin;
do $$ begin
 if exists(select 1 from public.mois_offerts) then raise exception 'Des cadeaux existent : retour interdit sans traitement explicite de leurs droits et crédits.'; end if;
end $$;
drop trigger if exists periode_offerte_checkout on public.intentions_souscription;
drop function if exists public.proteger_periode_offerte();
drop function if exists public.offrir_mois_abonnement(uuid,uuid,uuid,integer,text,boolean,jsonb);
drop function if exists public.lire_mois_offerts(uuid);
drop function if exists public.mois_offert_credit_applique(uuid,text);
drop table if exists public.mois_offerts;
do $$ declare d text; begin
 select pg_get_functiondef('public.poser_gardes_abonnement()'::regprocedure) into d;
 execute replace(d,'''mois_offerts'', ''verrous_facturation''','''verrous_facturation''');
 select pg_get_functiondef('public.poser_gardes_traversee()'::regprocedure) into d;
 execute replace(d,'''reseau_interets'',''mois_offerts''','''reseau_interets''');
 select pg_get_functiondef('public.verrou_facturation_prendre(uuid,uuid,text,integer)'::regprocedure) into d;
 execute replace(d,'''resiliation'', ''echeance'', ''cadeau''','''resiliation'', ''echeance''');
end $$;
alter table public.verrous_facturation drop constraint if exists verrous_facturation_operation_check;
alter table public.verrous_facturation add constraint verrous_facturation_operation_check check(operation in ('hausse','periodicite','resiliation','echeance'));
delete from supabase_migrations.schema_migrations where version='20261025192344';
commit;
