-- RETOUR ARRIÈRE de 20261116141850. Le retour applicatif reste possible,
-- mais retirer la protection en base rendrait ses droits au colocataire parti.
-- Sur un schéma antérieur, cette étape ne modifie rien.
do $retour$
begin
  if to_regprocedure('public.occupant_bail_incident(uuid,uuid,date,boolean)') is not null
     or exists (select from supabase_migrations.schema_migrations where version='20261116141850') then
    raise exception 'Retour refusé : conserver les droits après départ du colocataire et corriger en avant.';
  end if;
end $retour$;
