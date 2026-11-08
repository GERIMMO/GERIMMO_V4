-- Retour avant utilisation uniquement. Aucune donnée métier ne peut être supprimée.
do $retour$
begin
 if to_regclass('public.factures_automatiques') is not null then
 lock table public.factures_automatiques in access exclusive mode;
 if exists(select 1 from public.factures_automatiques) then raise exception 'Retour refusé : des données de factures_automatiques sont conservées. Corriger en avant.'; end if;
 end if;
 drop function if exists public.geste_facture_automatique(uuid,text,jsonb);
 drop function if exists public.regler_facture_automatique(uuid,boolean);
 drop table if exists public.factures_automatiques;
 delete from supabase_migrations.schema_migrations where version='20261108100000';
end $retour$;
