-- SCI-2, suite (audit après publication de la PR #347, 19/11/2026) : deux recherches de fiche par adresse e-mail
-- deviennent sans ambiguïté depuis que la fiche d'une société et celle de la personne physique qui la gère peuvent
-- partager une adresse (migration 20261119200000).
--
--  · `import_personne` (import du parc) retrouve le LOCATAIRE d'une ligne par son e-mail. Une société ne loue pas un
--    logement d'habitation ici : à adresse égale, la fiche de personne physique passe avant celle d'une société.
--  · `reprendre_soldes` (reprise comptable) retrouve le PROPRIÉTAIRE d'une ligne par son e-mail. Le propriétaire est la
--    fiche qui détient des lots : à adresse égale, la fiche titulaire d'une détention passe d'abord, puis la société.
--
-- Rien d'autre ne change : mêmes critères, même `limit 1`, seul l'ordre départage. Remplacement exact sur la définition
-- en place (refusé si la forme attendue n'est pas trouvée) ; rejouable : une définition déjà corrigée est laissée.
do $migration$
declare
  definition text;
  avant text;
  apres text;
  n_avant integer;
  n_apres integer;
begin
  -- 1. import_personne : la personne physique d'abord.
  definition := pg_get_functiondef('public.import_personne(uuid,text,text,text)'::regprocedure);
  avant := $sql$where organization_id = p_org and lower(email) = v_email limit 1;$sql$;
  apres := $sql$where organization_id = p_org and lower(email) = v_email
    order by coalesce(qualite in ('SCI', 'SCI familiale', 'Personne morale'), false), created_at limit 1;$sql$;
  n_avant := (length(definition) - length(replace(definition, avant, ''))) / length(avant);
  n_apres := (length(definition) - length(replace(definition, apres, ''))) / length(apres);
  if n_avant = 1 and n_apres = 0 then
    execute replace(definition, avant, apres);
  elsif not (n_avant = 0 and n_apres = 1) then
    raise exception 'import_personne : forme inattendue (% ancienne(s), % nouvelle(s))', n_avant, n_apres;
  end if;

  -- 2. reprendre_soldes : le détenteur d'abord, puis la société.
  definition := pg_get_functiondef('public.reprendre_soldes(uuid,uuid,jsonb,boolean)'::regprocedure);
  avant := $sql$and lower(p.email) = lower(btrim(v_ligne->>'proprietaire_email'))
         limit 1;$sql$;
  apres := $sql$and lower(p.email) = lower(btrim(v_ligne->>'proprietaire_email'))
         order by exists (select 1 from public.detentions d where d.person_id = p.id and d.organization_id = p_org) desc,
                  coalesce(p.qualite in ('SCI', 'SCI familiale', 'Personne morale'), false) desc, p.created_at
         limit 1;$sql$;
  n_avant := (length(definition) - length(replace(definition, avant, ''))) / length(avant);
  n_apres := (length(definition) - length(replace(definition, apres, ''))) / length(apres);
  if n_avant = 1 and n_apres = 0 then
    execute replace(definition, avant, apres);
  elsif not (n_avant = 0 and n_apres = 1) then
    raise exception 'reprendre_soldes : forme inattendue (% ancienne(s), % nouvelle(s))', n_avant, n_apres;
  end if;
end $migration$;

-- `create or replace` conserve les droits ; convention de toute migration.
select public.fermer_fonctions_a_anon();
notify pgrst, 'reload schema';
