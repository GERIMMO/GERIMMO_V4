-- RETOUR ARRIÈRE de 20261014504000_jour_de_paris_encaissements.sql (lot « fuseau-paris », 5/5)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Il fait le chemin inverse de la migration : il relit la définition EN VIGUEUR de `contre_passer_encaissement()` et remet
-- le jour de la session (`current_date`) à la place de `public.aujourdhui_paris()`, après avoir vérifié le NOMBRE EXACT
-- d'occurrences. Rien n'est recopié à la main ; aucune ancre de plusieurs lignes. Rejouable. Une définition réécrite depuis
-- arrête tout le script, sans rien modifier.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014504000_jour_de_paris_encaissements.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : un règlement saisi sans date (« Encaisser » du quittancement) est de nouveau daté du jour
-- UTC — la veille entre 00 h et 02 h à Paris, le 31 décembre pour un 1er janvier —, et la contre-écriture d'un encaissement
-- supprimé aussi. Ne modifie aucune donnée : les encaissements et écritures déjà datés gardent leur date.
-- Le retour rétablit `current_date` en minuscules ; la logique est celle d'avant.
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
  v_signature constant text := 'public.contre_passer_encaissement()';
  v_attendu constant integer := 2;
  v_oid regprocedure := to_regprocedure('public.contre_passer_encaissement()');
  v_def text;
  v_nb integer;
begin
  if v_oid is null then
    raise exception 'Retour arrière : la fonction % n''existe pas (base inattendue)', v_signature;
  end if;
  v_def := pg_get_functiondef(v_oid);
  select count(*) into v_nb from regexp_matches(v_def, 'public\.aujourdhui_paris\(\)', 'g');
  if v_nb = 0 then
    raise notice '% : ne cite plus aujourdhui_paris(), rien à faire', v_signature;
  elsif v_nb <> v_attendu then
    raise exception 'Retour arrière : % cite aujourdhui_paris() % fois au lieu de % : définition réécrite depuis, rien n''est modifié.', v_signature, v_nb, v_attendu;
  else
    execute regexp_replace(v_def, 'public\.aujourdhui_paris\(\)', 'current_date', 'g');
    raise notice '% : jour de la session rétabli', v_signature;
  end if;
end $retour_arriere$;

-- Valeur par défaut de encaissements.date_paiement : de nouveau le jour de la session.
do $retour_arriere$
declare v_defaut text;
begin
  select pg_get_expr(d.adbin, d.adrelid) into v_defaut
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.encaissements'::regclass and a.attname = 'date_paiement';
  if v_defaut ~* '^(public\.)?aujourdhui_paris\(\)$' then
    alter table public.encaissements alter column date_paiement set default current_date;
  elsif v_defaut ~* '^current_date$' then
    raise notice 'encaissements.date_paiement : déjà current_date, rien à faire';
  else
    raise exception 'Retour arrière : le défaut de encaissements.date_paiement est « % » : base inattendue, rien n''est modifié.', coalesce(v_defaut, '(aucun)');
  end if;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014504000';
  end if;
end $retour_arriere$;

commit;
