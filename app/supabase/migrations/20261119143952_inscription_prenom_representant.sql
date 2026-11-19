-- Refuser une nouvelle SCI sans le prénom de la personne qui ouvre son espace.
-- L'initialisation des espaces existants reste idempotente et leur identité intacte.
do $migration$
declare
  definition text := pg_get_functiondef('public.initialiser_espace_proprietaire()'::regprocedure);
  ancre text := '    if v_societe is null or length(v_societe)>100 then';
  garde text := $garde$    if coalesce(v_prenom, '') !~ '[^[:space:]]' or length(v_prenom) > 100 then
      raise exception 'Indiquez votre prénom (100 caractères au plus) pour créer votre fiche de représentant de la société.';
    end if;
$garde$;
begin
  if strpos(definition, ancre) = 0 then
    raise exception 'Garde de création société introuvable : vérifier la migration avant application';
  end if;
  if strpos(definition, garde) = 0 then
    execute replace(definition, ancre, garde || ancre);
  end if;
end;
$migration$;
