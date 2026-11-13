-- RETOUR ARRIÈRE de 20261112200752. Répétition uniquement si aucune écriture ne porte de provenance fiscale.
do $retour$
begin
 if not exists(select from pg_attribute where attrelid='public.ecritures'::regclass and attname='bien_source_id' and not attisdropped) then return; end if;
 lock table public.ecritures in access exclusive mode nowait;
 if exists(select from public.ecritures where bien_source_id is not null or avis_fiscal_id is not null) then
   raise exception 'Des écritures fiscales sont rattachées à un bien. Conserver leurs preuves et corriger en avant.';
 end if;
 drop view public.journal_par_bien;
 drop function public.enregistrer_avis_foncier(uuid,uuid,uuid,date,integer,text,bigint,bigint,bigint);
 drop trigger verifier_source_avis_foncier on public.ecritures;
 drop function public.verifier_source_avis_foncier();
 alter table public.ecritures drop column avis_fiscal_id, drop column bien_source_id;
 delete from supabase_migrations.schema_migrations where version='20261112200752';
end $retour$;
