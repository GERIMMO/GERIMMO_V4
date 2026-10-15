-- RETOUR ARRIÈRE de 20261014503000_jour_de_paris_appels_et_quittances.sql (lot « fuseau-paris », 4/5)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Il fait le chemin inverse de la migration : il relit chaque définition EN VIGUEUR et remet le jour de la session
-- (`current_date`) à la place de `public.aujourdhui_paris()`, après avoir vérifié le NOMBRE EXACT d'occurrences. Aucune
-- définition n'est recopiée à la main ; aucune ancre de plusieurs lignes. Rejouable : une fonction qui ne cite plus
-- `aujourdhui_paris()` est laissée telle quelle. Une fonction dont le nombre d'occurrences est inattendu (réécrite depuis)
-- arrête tout le script, sans rien modifier.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014503000_jour_de_paris_appels_et_quittances.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : entre 22 h et 24 h UTC (00 h à 02 h à Paris), une quittance ou un reçu émis ou réémis est
-- daté de la veille, la génération des appels s'arrête au mois du jour UTC, et la fenêtre d'envoi des quittances ou la
-- solidarité d'un colocataire se décale d'un jour. Ne modifie aucune donnée : les appels et quittances déjà créés gardent
-- leur date. Le retour rétablit `current_date` en minuscules ; la logique est celle d'avant, la casse du mot peut différer
-- d'une base qui l'écrivait en capitales.
--
-- VAGUE 4a (20261014416000, décision X13). Sur une base qui l'a reçue, `resynchroniser_quittances` et le défaut de
-- `quittances.date_emission` sont au jour de Paris par l'expression explicite `(now() at time zone 'Europe/Paris')::date`, et la
-- migration du lot ne les a PAS modifiés. Ce retour ne les modifie pas non plus : il ne remet JAMAIS `current_date` sur ces deux objets
-- (ce serait défaire X13, qui reste en vigueur) ; il les nomme « déjà au jour de Paris par X13, rien à faire ». Seuls les objets que le
-- lot avait réellement convertis (cités par `public.aujourdhui_paris()`) reviennent à `current_date`. Le retour de X13 est
-- 20261014416000_quittance_jour_de_paris.retour.sql.
--
-- À jouer AVANT le retour de 20261014500000 (qui refuse tant qu'un objet cite encore la fonction du jour de Paris).

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.
-- Hors transaction, l'instruction démarre à l'instant même de sa transaction ; dans un lot, elle est plus tardive.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;


begin;
set local lock_timeout = '10s';

do $retour_arriere$
declare
  -- signature, puis nombre exact de `public.aujourdhui_paris()` posés par la migration dans la définition en vigueur.
  v_cibles constant text[][] := array[
    ['public.generer_appels_loyer_interne(uuid)', '2'],
    ['public.cycle_mensuel_interne()', '1'],
    ['public.resynchroniser_quittances(uuid)', '2'],
    ['public.quittances_a_envoyer(integer)', '1'],
    ['public.appels_a_envoyer(integer)', '1']
  ];
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
    select count(*) into v_nb from regexp_matches(v_def, 'public\.aujourdhui_paris\(\)', 'g');
    if v_nb = 0 then
      raise notice '% : ne cite plus aujourdhui_paris(), rien à faire (si elle date du jour de Paris par l''expression de la vague 4a, X13, elle le reste)', v_signature;
      continue;
    end if;
    if v_nb <> v_attendu then
      raise exception 'Retour arrière : % cite aujourdhui_paris() % fois au lieu de % : définition réécrite depuis, rien n''est modifié.', v_signature, v_nb, v_attendu;
    end if;
    execute regexp_replace(v_def, 'public\.aujourdhui_paris\(\)', 'current_date', 'g');
    raise notice '% : jour de la session rétabli', v_signature;
  end loop;
end $retour_arriere$;

-- Valeur par défaut de quittances.date_emission : de nouveau le jour de la session.
do $retour_arriere$
declare v_defaut text;
begin
  select pg_get_expr(d.adbin, d.adrelid) into v_defaut
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.quittances'::regclass and a.attname = 'date_emission';
  if v_defaut ~* '^(public\.)?aujourdhui_paris\(\)$' then
    alter table public.quittances alter column date_emission set default current_date;
  elsif v_defaut ~* '^\(*\s*now\(\)\s+at\s+time\s+zone\s+''Europe/Paris''(::text)?\s*\)*\s*::\s*date\s*\)*$' then
    -- Posé par la vague 4a (X13) : le lot n'y a pas touché, le retour non plus.
    raise notice 'quittances.date_emission : au jour de Paris par la vague 4a (X13), le lot n''y a pas touché, rien à faire';
  elsif v_defaut ~* '^current_date$' then
    raise notice 'quittances.date_emission : déjà current_date, rien à faire';
  else
    raise exception 'Retour arrière : le défaut de quittances.date_emission est « % » : base inattendue, rien n''est modifié.', coalesce(v_defaut, '(aucun)');
  end if;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014503000';
  end if;
end $retour_arriere$;

commit;
