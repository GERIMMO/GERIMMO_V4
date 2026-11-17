-- RETOUR ARRIÈRE de 20261116201034. Sur un schéma antérieur, aucune action.
do $retour$
begin
  if to_regprocedure('public.stripe_evenement_appliquer_avant_regularisation(text,uuid,text,jsonb)') is not null
     or exists (select from supabase_migrations.schema_migrations where version='20261116201034') then
    raise exception 'Retour refusé. Conserver les preuves des impayés, des règlements et des courriers contractuels et corriger en avant.';
  end if;
end $retour$;
