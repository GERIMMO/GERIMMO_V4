-- Le serveur signe la photo avec des droits de service, uniquement après
-- l'autorisation ci-dessous. Une fiche ancienne doit aussi porter la bonne
-- provenance avant de transmettre son chemin au serveur.
do $migration$
declare
  definition text := pg_get_functiondef('public.lire_photo_incident_artisan(uuid,uuid,uuid)'::regprocedure);
  ancre text := 'if v_chemin is null then';
  garde text := 'if not ged_securite_interne.chemin_organisation(v_org,v_chemin) then';
begin
  if strpos(definition,garde)>0 then return; end if;
  if strpos(definition,ancre)=0 then raise exception 'Lecture photo artisan inattendue'; end if;
  execute replace(definition,ancre,garde);
end $migration$;

notify pgrst,'reload schema';
