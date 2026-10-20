-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014501000_jour_de_paris_etat_loyers_et_impayes.sql (lot « fuseau-paris », 2/5)
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
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014501000_jour_de_paris_etat_loyers_et_impayes.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : entre 22 h et 24 h UTC (00 h à 02 h à Paris), l'état d'un loyer échu la veille à Paris
-- redevient « attendu », l'alerte d'impayé et les relances se décalent d'un jour, le brief de la direction compte les
-- échéances et les alertes avec le jour UTC, et la date d'une relance saisie sans date redevient celle de la session.
-- Ne modifie aucune donnée : ni appel, ni encaissement, ni relance, ni alerte déjà posée.
-- Le retour rétablit `current_date` en minuscules ; la logique est celle d'avant, la casse du mot peut différer d'une base
-- qui l'écrivait en capitales.
--
-- À jouer AVANT le retour de 20261014500000 (qui refuse tant qu'un objet cite encore la fonction du jour de Paris).

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

do $retour_arriere$
declare
  -- signature, puis nombre exact de `public.aujourdhui_paris()` posés par la migration dans la définition en vigueur.
  v_cibles constant text[][] := array[
    ['public.etat_loyers_bail_brut(uuid)', '1'],
    ['public.suivre_impayes_bail(uuid)', '1'],
    ['public.relances_loyer_dues(integer)', '6'],
    ['public.relance_loyer_consigner(uuid,text,text)', '2'],
    ['public.actualiser_orchestration()', '2'],
    ['public.collecter_source_direction(text)', '7']
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
      raise notice '% : ne cite plus aujourdhui_paris(), rien à faire', v_signature;
      continue;
    end if;
    if v_nb <> v_attendu then
      raise exception 'Retour arrière : % cite aujourdhui_paris() % fois au lieu de % : définition réécrite depuis, rien n''est modifié.', v_signature, v_nb, v_attendu;
    end if;
    execute regexp_replace(v_def, 'public\.aujourdhui_paris\(\)', 'current_date', 'g');
    raise notice '% : jour de la session rétabli', v_signature;
  end loop;
end $retour_arriere$;

-- Valeur par défaut de relances.date_envoi : de nouveau le jour de la session.
do $retour_arriere$
declare v_defaut text;
begin
  select pg_get_expr(d.adbin, d.adrelid) into v_defaut
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.relances'::regclass and a.attname = 'date_envoi';
  if v_defaut ~* '^(public\.)?aujourdhui_paris\(\)$' then
    alter table public.relances alter column date_envoi set default current_date;
  elsif v_defaut ~* '^current_date$' then
    raise notice 'relances.date_envoi : déjà current_date, rien à faire';
  else
    raise exception 'Retour arrière : le défaut de relances.date_envoi est « % » : base inattendue, rien n''est modifié.', coalesce(v_defaut, '(aucun)');
  end if;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014501000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
