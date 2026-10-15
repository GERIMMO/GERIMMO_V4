-- RETOUR ARRIÈRE de 20261014821000_jour_de_paris_irl_terme_charges_rapports.sql (lot « fuseau-suite », 2/2)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Il fait le chemin inverse de la migration : il relit chaque définition EN VIGUEUR et remet le jour de la session
-- (`current_date`) à la place de `public.aujourdhui_paris()`, et `date_trunc('month',now())` à la place de
-- `date_trunc('month', public.aujourdhui_paris()::timestamp)` dans preparer_rapports_automatiques, après avoir vérifié le
-- NOMBRE EXACT d'occurrences. Aucune définition n'est recopiée à la main ; aucune ancre de plusieurs lignes. Rejouable : une
-- fonction qui ne cite plus `aujourdhui_paris()` est laissée telle quelle. Une fonction dont le nombre d'occurrences est
-- inattendu (réécrite depuis) arrête tout le script, sans rien modifier.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014821000_jour_de_paris_irl_terme_charges_rapports.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : entre minuit et 1 h (hiver) ou 2 h (été) à Paris, une révision IRL datée du jour (de Paris)
-- est de nouveau refusée comme « datée de demain », le terme du bail est calculé à la date de la veille, le 1er janvier une
-- régularisation n'est pas encore « tardive », le rapport de gestion proposé le 1er du mois est celui du mois d'avant le mois
-- écoulé, et les dates par défaut (demande de révision, émission d'une régularisation, versement au propriétaire) sont celles du
-- jour UTC. Ne modifie aucune donnée : révisions, régularisations, rapports et alertes déjà enregistrés gardent leurs dates.
-- Le retour rétablit `current_date` en minuscules dans les corps (la casse d'origine) ; dans les en-têtes, la base le relit en
-- capitales (`DEFAULT CURRENT_DATE`), comme avant la migration.
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
    ['public.reviser_loyer(uuid,numeric,text,date)', '2'],
    ['public.terme_bail(uuid,date)', '1'],
    ['public.regulariser_charges(uuid,integer,numeric,uuid,text,boolean)', '4'],
    ['public.rapport_du_lot(uuid,date)', '1'],
    ['public.envoyer_rapport(uuid,text)', '1']
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

-- Rapport de gestion préparé automatiquement : de nouveau le mois de la session. Seule l'expression posée par la migration est
-- défaite, une fois ; toute autre citation de la fonction du jour de Paris arrête le script.
do $retour_arriere$
declare
  v_signature constant text := 'public.preparer_rapports_automatiques()';
  c_pose constant text := 'date_trunc\(''month'', public\.aujourdhui_paris\(\)::timestamp\)';
  v_oid regprocedure := to_regprocedure('public.preparer_rapports_automatiques()');
  v_def text;
  v_nb integer;
  v_cite integer;
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue)', v_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  select count(*) into v_nb from regexp_matches(v_def, c_pose, 'g');
  select count(*) into v_cite from regexp_matches(v_def, 'aujourdhui_paris\(\)', 'g');
  if v_nb = 0 and v_cite = 0 then
    raise notice '% : ne cite plus aujourdhui_paris(), rien à faire', v_signature;
  elsif v_nb = 1 and v_cite = 1 then
    execute regexp_replace(v_def, c_pose, 'date_trunc(''month'',now())', 'g');
    raise notice '% : mois de la session rétabli', v_signature;
  else
    raise exception 'Retour arrière : % cite aujourdhui_paris() % fois, dont % sous la forme posée par la migration, au lieu d''une : définition réécrite depuis, rien n''est modifié.', v_signature, v_cite, v_nb;
  end if;
end $retour_arriere$;

-- Valeur par défaut de regularisations_charges.date_emission : de nouveau le jour de la session. Un défaut à l'expression explicite
-- du jour de Paris n'a pas été posé par la migration (elle l'a trouvé et laissé) : il reste tel quel.
do $retour_arriere$
declare v_defaut text;
begin
  select pg_get_expr(d.adbin, d.adrelid) into v_defaut
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.regularisations_charges'::regclass and a.attname = 'date_emission';
  if v_defaut ~* '^(public\.)?aujourdhui_paris\(\)$' then
    alter table public.regularisations_charges alter column date_emission set default current_date;
  elsif v_defaut ~* '^current_date$' then
    raise notice 'regularisations_charges.date_emission : déjà current_date, rien à faire';
  elsif v_defaut ~* '^\(*\s*now\(\)\s+at\s+time\s+zone\s+''Europe/Paris''(::text)?\s*\)*\s*::\s*date\s*\)*$' then
    raise notice 'regularisations_charges.date_emission : jour de Paris posé par une autre migration, laissé tel quel';
  else
    raise exception 'Retour arrière : le défaut de regularisations_charges.date_emission est « % » : base inattendue, rien n''est modifié.', coalesce(v_defaut, '(aucun)');
  end if;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014821000';
  end if;
end $retour_arriere$;

commit;
