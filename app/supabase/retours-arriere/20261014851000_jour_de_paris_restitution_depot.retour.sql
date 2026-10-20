-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014851000_jour_de_paris_restitution_depot.sql (restitution du dépôt de garantie au jour de Paris :
-- décision du 15/10, point 1, complétée le 16/10)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Il fait le chemin inverse de la migration : il relit chaque définition EN VIGUEUR et remet le jour de la session
-- (`current_date`) à la place de `public.aujourdhui_paris()`, après avoir vérifié le NOMBRE EXACT d'occurrences. Aucune
-- définition n'est recopiée à la main ; aucune ancre de plusieurs lignes. Rejouable : une fonction qui ne cite plus
-- `aujourdhui_paris()` est laissée telle quelle (c'est aussi le cas d'une fonction que la migration a trouvée déjà au jour de
-- Paris par l'expression `(now() at time zone 'Europe/Paris')::date` et n'a pas touchée). Une fonction dont le nombre
-- d'occurrences est inattendu (réécrite depuis) arrête tout le script, sans rien modifier.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014851000_jour_de_paris_restitution_depot.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : entre minuit et 1 h (hiver) ou 2 h (été) à Paris, un décompte de restitution finalisé et ses
-- deux écritures du journal (restitution du dépôt, trop-perçu) sont de nouveau datés de la veille (le jour UTC, l'année
-- précédente le 1er janvier) ; l'envoi du décompte daté du jour même est de nouveau refusé, et sans date il prend la veille.
-- Ne modifie aucune donnée : restitutions, décomptes envoyés et écritures déjà datés gardent leur date.
-- Le retour rétablit `current_date` en minuscules, y compris dans l'en-tête de marquer_decompte_envoye (valeur par défaut de
-- `p_date`) : la base le relit `CURRENT_DATE`, comme avant la migration.
--
-- À jouer AVANT le retour de 20261014500000 (qui refuse tant qu'un objet cite encore la fonction du jour de Paris) ; voir l'ordre
-- complet des retours dans la section « Lot « fuseau-suite » » du LISEZ-MOI.

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

do $retour_arriere$
declare
  -- signature, puis nombre exact de `public.aujourdhui_paris()` posés par la migration dans la définition en vigueur.
  v_cibles constant text[][] := array[
    ['public.finaliser_decompte(uuid)', '5'],
    ['public.marquer_decompte_envoye(uuid,date)', '2']
  ];
  -- La fonction du jour de Paris, qualifiée ou non (pg_get_functiondef ne qualifie pas, dans un en-tête, ce qui est dans le
  -- chemin de recherche).
  c_paris constant text := '(\mpublic\.)?\maujourdhui_paris\(\)';
  v_i integer;
  v_signature text;
  v_attendu integer;
  v_oid regprocedure;
  v_def text;
  v_nb integer;
begin
  for v_i in 1 .. array_length(v_cibles, 1) loop
    v_signature := v_cibles[v_i][1];
    v_attendu := v_cibles[v_i][2]::integer;
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue)', v_signature;
    end if;
    v_def := pg_get_functiondef(v_oid);
    select count(*) into v_nb from regexp_matches(v_def, c_paris, 'g');
    if v_nb = 0 then
      raise notice '% : ne cite plus aujourdhui_paris(), rien à faire', v_signature;
      continue;
    end if;
    if v_nb <> v_attendu then
      raise exception 'Retour arrière : % cite aujourdhui_paris() % fois au lieu de % : définition réécrite depuis, rien n''est modifié.', v_signature, v_nb, v_attendu;
    end if;
    execute regexp_replace(v_def, c_paris, 'current_date', 'g');
    raise notice '% : jour de la session rétabli', v_signature;
  end loop;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014851000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
