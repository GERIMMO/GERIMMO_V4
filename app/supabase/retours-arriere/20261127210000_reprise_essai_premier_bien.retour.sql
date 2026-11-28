-- Ferme les nouvelles demandes. Les périodes déjà accordées, leur journal
-- et le droit consommé sont conservés, y compris après réapplication.
drop function if exists public.rouvrir_essai_premier_bien(uuid);
drop function if exists public.reprise_premier_bien_possible(uuid);

do $garde$
declare
  definition text := pg_get_functiondef('public.organizations_champs_reserves_sa()'::regprocedure);
begin
  execute regexp_replace(definition,
    '  -- reprise_essai_premier_bien.*?  -- fin_reprise_essai_premier_bien' || chr(10), '');
end;
$garde$;

delete from supabase_migrations.schema_migrations where version = '20261127210000';
