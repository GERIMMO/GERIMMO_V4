-- Le retour d'application conserve l'import compatible et les données existantes.
do $retour$
begin
  if to_regprocedure('public.adresse_import_parc(text,text,text,text)') is not null
     or exists (select from supabase_migrations.schema_migrations where version='20261117092314') then
    raise exception 'Retour refusé. Conserver les rattachements et corriger l’import en avant.';
  end if;
end $retour$;
