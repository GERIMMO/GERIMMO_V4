-- Lot « fuseau-suite » (1/2), décision du dirigeant du 15 octobre 2026, point 1 : le dépôt de garantie et le journal
-- comptable général datent « aujourd'hui » du jour de Paris.
--
-- LE DÉFAUT. Ces objets prenaient `current_date`, le jour du fuseau de la SESSION (UTC chez Supabase). Entre minuit et 1 h
-- (hiver) ou 2 h (été) à Paris, la base était encore la veille : un dépôt de garantie encaissé sans date, sa pièce comptable,
-- la contre-écriture d'un dépôt retiré et l'imputation d'une contre-écriture passée depuis le journal étaient datés de la veille
-- (le 31 décembre pour un 1er janvier : l'année précédente du journal). Les loyers, eux, sont au jour de Paris depuis le lot
-- « fuseau-paris » (migrations 20261014500000 à 20261014504000) ; cette migration y rattache le dépôt et le journal.
-- Maintenant : `public.aujourdhui_paris()` (migration 20261014500000). Aucun montant, aucune colonne, aucune signature, aucun
-- droit ne change ; seul le JOUR de référence change. Aucune ligne existante n'est réécrite : les dépôts, écritures et
-- contre-écritures déjà datés gardent leur date.
--
-- Objets réécrits (nombre exact de `current_date` attendu dans la définition en vigueur, tous remplacés) :
--   encaisser_depot(uuid,numeric,date,text,uuid,text,uuid)   3   date du dépôt saisi sans date, date de pièce et d'imputation de son écriture
--   contre_passer_depot_encaissement()                       2   date de pièce et d'imputation de la contre-écriture d'un dépôt retiré
--   contre_ecriture(uuid,text)                               1   date d'imputation d'une contre-écriture passée depuis le journal
-- Valeurs par défaut : depot_encaissements.date_encaissement, ecritures.date_piece, ecritures.date_imputation (une ligne
-- écrite sans date).
--
-- COMMENT. Chaque fonction est relue dans sa définition EN VIGUEUR (pg_get_functiondef), jamais recopiée à la main : une
-- définition recopiée écraserait ce que d'autres migrations y ont ajouté. Aucune ancre de plusieurs lignes (la mise en forme
-- en production peut différer de celle du banc) : on remplace le seul mot `current_date` et on exige le NOMBRE EXACT
-- d'occurrences ci-dessus. Une fonction DÉJÀ au jour de Paris (ce nombre exact de `public.aujourdhui_paris()` ou de
-- `(now() at time zone 'Europe/Paris')::date`, et plus aucun `current_date`) est laissée telle quelle : rejeu sans effet. Toute
-- autre forme (autre nombre, mélange des deux, ni l'un ni l'autre, fonction absente) arrête la migration avec un message qui
-- nomme la fonction, sans rien modifier (dans la transaction du chantier `migrations.yml`, rien ne subsiste).
--
-- Droits : inchangés (`create or replace` conserve ceux en vigueur) ; la fermeture à `anon` est rappelée en fin de fichier.
-- Le changement de valeur par défaut prend un verrou bref sur depot_encaissements et ecritures.
-- Retour arrière : supabase/retours-arriere/20261014820000_jour_de_paris_depot_et_journal.retour.sql

do $jour_de_paris$
declare
  -- signature, puis nombre exact de `current_date` attendus dans la définition en vigueur.
  v_cibles constant text[][] := array[
    ['public.encaisser_depot(uuid,numeric,date,text,uuid,text,uuid)', '3'],
    ['public.contre_passer_depot_encaissement()', '2'],
    ['public.contre_ecriture(uuid,text)', '1']
  ];
  -- Le jour de Paris sous ses deux écritures admises : la fonction du lot (l'en-tête relu par pg_get_functiondef ne qualifie pas ce
  -- qui est dans le chemin de recherche, d'où `public.` facultatif) ou l'expression explicite (rendue `((now() AT TIME ZONE
  -- 'Europe/Paris'::text))::date` dans un en-tête).
  c_paris constant text := '(\mpublic\.)?\maujourdhui_paris\(\)|\(\s*now\(\)\s+at\s+time\s+zone\s+''Europe/Paris''(::text)?\s*\)\)?\s*::\s*date';
  v_i integer;
  v_signature text;
  v_attendu integer;
  v_oid regprocedure;
  v_def text;
  v_session integer;
  v_paris integer;
begin
  if to_regprocedure('public.aujourdhui_paris()') is null then
    raise exception 'Jour de Paris : la fonction public.aujourdhui_paris() est absente ; appliquez d''abord 20261014500000.';
  end if;
  for v_i in 1 .. array_length(v_cibles, 1) loop
    v_signature := v_cibles[v_i][1];
    v_attendu := v_cibles[v_i][2]::integer;
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Jour de Paris : la fonction % est absente de cette base ; rien n''est modifié.', v_signature;
    end if;
    v_def := pg_get_functiondef(v_oid);
    select count(*) into v_session from regexp_matches(v_def, '\mcurrent_date\M', 'gi');
    select count(*) into v_paris from regexp_matches(v_def, c_paris, 'gi');
    if v_session = v_attendu and v_paris = 0 then
      execute regexp_replace(v_def, '\mcurrent_date\M', 'public.aujourdhui_paris()', 'gi');
    elsif v_session = 0 and v_paris = v_attendu then
      raise notice 'Jour de Paris : % est déjà au jour de Paris, rien à faire.', v_signature;
    elsif v_session = 0 and v_paris = 0 then
      raise exception 'Jour de Paris : % ne lit ni current_date ni le jour de Paris : définition inattendue, rien n''est modifié.', v_signature;
    else
      raise exception 'Jour de Paris : % contient % occurrence(s) de current_date et % du jour de Paris, au lieu de % de l''une ou de l''autre seule : définition inattendue, rien n''est modifié. Comparez-la à celle du dépôt (pg_get_functiondef) avant de réessayer.',
        v_signature, v_session, v_paris, v_attendu;
    end if;
  end loop;
end $jour_de_paris$;

-- Valeurs par défaut : une ligne écrite sans date prend le jour de Paris. Une colonne déjà au jour de Paris (la fonction, ou
-- l'expression explicite) est laissée telle quelle ; une colonne dont le défaut n'est ni `current_date` ni le jour de Paris
-- arrête la migration.
do $jour_de_paris_defauts$
declare
  v_colonnes constant text[][] := array[
    ['depot_encaissements', 'date_encaissement'],
    ['ecritures', 'date_piece'],
    ['ecritures', 'date_imputation']
  ];
  v_i integer;
  v_defaut text;
begin
  for v_i in 1 .. array_length(v_colonnes, 1) loop
    select pg_get_expr(d.adbin, d.adrelid) into v_defaut
      from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
     where d.adrelid = format('public.%I', v_colonnes[v_i][1])::regclass and a.attname = v_colonnes[v_i][2];
    if v_defaut ~* '^(public\.)?aujourdhui_paris\(\)$'
       or v_defaut ~* '^\(*\s*now\(\)\s+at\s+time\s+zone\s+''Europe/Paris''(::text)?\s*\)*\s*::\s*date\s*\)*$' then
      continue;
    elsif v_defaut ~* '^current_date$' then
      execute format('alter table public.%I alter column %I set default public.aujourdhui_paris()', v_colonnes[v_i][1], v_colonnes[v_i][2]);
    else
      raise exception 'Jour de Paris : le défaut de %.% est « % » au lieu de CURRENT_DATE : définition inattendue, rien n''est modifié.',
        v_colonnes[v_i][1], v_colonnes[v_i][2], coalesce(v_defaut, '(aucun)');
    end if;
  end loop;
end $jour_de_paris_defauts$;

select public.fermer_fonctions_a_anon();
