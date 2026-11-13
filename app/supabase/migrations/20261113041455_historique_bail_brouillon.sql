-- Les dates prévues d’un brouillon ne constituent pas des événements du bail.
-- Remplacer seulement les deux filtres dans la définition déjà migrée ; conserver ACL et périmètre.
do $historique$
declare
  definition text := pg_get_functiondef('public.historique_du_lot(uuid,integer)'::regprocedure);
  filtre text;
  nouveau text;
begin
  foreach filtre in array array['where b.date_debut is not null', 'where b.date_fin is not null'] loop
    nouveau := replace(filtre, 'where ', 'where b.etat <> ''brouillon'' and ');
    if strpos(definition, nouveau) > 0 and strpos(definition, filtre) = 0 then continue; end if;
    if length(definition) - length(replace(definition, filtre, '')) <> length(filtre) then
      raise exception 'Historique du lot : filtre de date absent ou ambigu';
    end if;
    definition := replace(definition, filtre, nouveau);
  end loop;
  execute definition;
end $historique$;
