-- Garder les décisions et confirmations d'envoi en cas de retour applicatif.
do $retour$
begin
  if to_regprocedure('public.preparer_renvoi_invitation_artisan(uuid,uuid,timestamptz)') is not null
     or exists (select from supabase_migrations.schema_migrations where version='20261117095320') then
    raise exception 'Retour refusé. Conserver les preuves des envois et corriger en avant.';
  end if;
end $retour$;
