-- RETOUR ARRIÈRE de 20261119200300. `import_personne` et `reprendre_soldes` reprennent la première fiche trouvée pour une
-- adresse, sans départager société et personne physique. À jouer AVANT le retour de 20261119200000 (qui refuse tant
-- qu'une société et une personne physique partagent une adresse). Aucune donnée touchée. Rejouable.
do $retour$
declare
  definition text;
  avant text;
  apres text;
  n_avant integer;
  n_apres integer;
begin
  definition := pg_get_functiondef('public.import_personne(uuid,text,text,text)'::regprocedure);
  avant := $sql$where organization_id = p_org and lower(email) = v_email limit 1;$sql$;
  apres := $sql$where organization_id = p_org and lower(email) = v_email
    order by coalesce(qualite in ('SCI', 'SCI familiale', 'Personne morale'), false), created_at limit 1;$sql$;
  n_avant := (length(definition) - length(replace(definition, avant, ''))) / length(avant);
  n_apres := (length(definition) - length(replace(definition, apres, ''))) / length(apres);
  if n_apres = 1 and n_avant = 0 then
    execute replace(definition, apres, avant);
  elsif not (n_apres = 0 and n_avant = 1) then
    raise exception 'Retour refusé : import_personne a une forme inattendue (% ancienne(s), % nouvelle(s)).', n_avant, n_apres;
  end if;

  definition := pg_get_functiondef('public.reprendre_soldes(uuid,uuid,jsonb,boolean)'::regprocedure);
  avant := $sql$and lower(p.email) = lower(btrim(v_ligne->>'proprietaire_email'))
         limit 1;$sql$;
  apres := $sql$and lower(p.email) = lower(btrim(v_ligne->>'proprietaire_email'))
         order by exists (select 1 from public.detentions d where d.person_id = p.id and d.organization_id = p_org) desc,
                  coalesce(p.qualite in ('SCI', 'SCI familiale', 'Personne morale'), false) desc, p.created_at
         limit 1;$sql$;
  n_avant := (length(definition) - length(replace(definition, avant, ''))) / length(avant);
  n_apres := (length(definition) - length(replace(definition, apres, ''))) / length(apres);
  if n_apres = 1 and n_avant = 0 then
    execute replace(definition, apres, avant);
  elsif not (n_apres = 0 and n_avant = 1) then
    raise exception 'Retour refusé : reprendre_soldes a une forme inattendue (% ancienne(s), % nouvelle(s)).', n_avant, n_apres;
  end if;
  delete from supabase_migrations.schema_migrations where version = '20261119200300';
end $retour$;
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
