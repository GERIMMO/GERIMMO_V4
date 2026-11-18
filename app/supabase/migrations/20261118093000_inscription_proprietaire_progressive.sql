-- Chantier UX 3 : les coordonnées sont complétées dans l'espace avant les documents.
-- Aucun changement de droits, de données existantes, d'essai ou des autres ouvertures.
do $migration$
declare
  definition text := pg_get_functiondef('public.initialiser_espace_proprietaire()'::regprocedure);
  garde text := $garde$  if coalesce(v_adresse, '') !~ '[^[:space:]]' or coalesce(v_cp, '') !~ '[^[:space:]]' or coalesce(v_ville, '') !~ '[^[:space:]]' then
    raise exception 'Renseignez une adresse postale complète (adresse, code postal et ville) pour vos courriers.';
  end if;
$garde$;
begin
  if strpos(definition, garde) = 0 then
    raise exception 'Initialisation propriétaire inattendue : vérifier la migration avant application';
  end if;
  execute replace(definition, garde, '');
end;
$migration$;
notify pgrst, 'reload schema';
