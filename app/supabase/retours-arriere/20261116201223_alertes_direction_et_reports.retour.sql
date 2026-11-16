-- RETOUR ARRIÈRE de 20261116201223. Sur un schéma antérieur, aucune action.
do $retour$
begin
  if to_regprocedure('public.source_report_courriel(uuid,text,uuid)') is not null
     or exists (select from supabase_migrations.schema_migrations where version='20261116201223') then
    raise exception 'Retour refusé. Conserver les droits des destinataires et les événements de report et corriger en avant.';
  end if;
end $retour$;
