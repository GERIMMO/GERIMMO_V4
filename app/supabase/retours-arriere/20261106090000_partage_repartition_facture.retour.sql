-- Retour avant utilisation uniquement. Aucune donnée métier ne peut être supprimée.
do $retour$
begin
 if to_regclass('public.documents_repartition_fourniture') is not null then
 lock table public.documents_repartition_fourniture in access exclusive mode;
 if exists(select 1 from public.documents_repartition_fourniture) then raise exception 'Retour refusé : des données de documents_repartition_fourniture sont conservées. Corriger en avant.'; end if;
 end if;
 drop function if exists public.diffuser_pdf_repartition(uuid,uuid,uuid);
 drop function if exists public.enregistrer_pdf_repartition(uuid,uuid,uuid,text,text,bigint,text);
 drop table if exists public.documents_repartition_fourniture;
 delete from supabase_migrations.schema_migrations where version='20261106090000';
end $retour$;
