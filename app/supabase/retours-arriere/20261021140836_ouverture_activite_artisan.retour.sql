-- Instruction atomique ; n’efface aucun dossier, document ni règlement déclaré.
-- Suspend les nouvelles saisies ; les dossiers existants restent consultables.
do $retour$
begin
  perform set_config('lock_timeout','10s',true);
  update public.artisan_modules_locaux set actif=false where code in ('clients','reglements');
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version='20261021140836';
  end if;
end $retour$;
