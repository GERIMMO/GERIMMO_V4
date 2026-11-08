-- Retour avant utilisation uniquement. Aucune donnée métier ne peut être supprimée.
do $retour$
begin
 drop function if exists public.rouvrir_repartition_fourniture(uuid,uuid);
 delete from supabase_migrations.schema_migrations where version='20261107193000';
end $retour$;
