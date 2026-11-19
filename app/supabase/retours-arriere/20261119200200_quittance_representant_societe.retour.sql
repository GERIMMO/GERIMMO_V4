-- RETOUR ARRIÈRE de 20261119200200 (SCI-3). `quittance_document` ne rend plus le représentant d'une société
-- bailleresse : la quittance redit « Je soussigné(e) <Société> » (le code d'avant suffit ; le code actuel lit la clé
-- absente comme « pas de représentant »). Aucune donnée touchée. Rejouable : une définition déjà rétablie est laissée.
do $retour$
declare
  definition text;
  avant text := $sql$jsonb_agg(jsonb_build_object('nom', p.nom, 'prenom', p.prenom) order by p.nom, p.prenom)$sql$;
  apres text := $sql$jsonb_agg(jsonb_build_object('nom', p.nom, 'prenom', p.prenom)
        -- SCI-3 : la personne physique qui signe pour la société (pouvoir actif au bail) — nom et prénom seuls.
        || coalesce((select jsonb_build_object('representant', jsonb_build_object('nom', r.nom, 'prenom', r.prenom))
                     from public.representants_actifs_bail(b.id) r
                     where r.societe_id = p.id
                     limit 1), '{}'::jsonb)
        order by p.nom, p.prenom)$sql$;
  n_avant integer;
  n_apres integer;
begin
  definition := pg_get_functiondef('public.quittance_document(uuid)'::regprocedure);
  n_avant := (length(definition) - length(replace(definition, avant, ''))) / length(avant);
  n_apres := (length(definition) - length(replace(definition, apres, ''))) / length(apres);
  if n_apres = 1 and n_avant = 0 then
    execute replace(definition, apres, avant);
  elsif not (n_apres = 0 and n_avant = 1) then
    raise exception 'Retour refusé : quittance_document a une forme inattendue (% ancienne(s), % nouvelle(s)).', n_avant, n_apres;
  end if;
  revoke execute on function public.quittance_document(uuid) from public, anon;
  grant execute on function public.quittance_document(uuid) to authenticated, service_role;
  delete from supabase_migrations.schema_migrations where version = '20261119200200';
end $retour$;
notify pgrst, 'reload schema';
