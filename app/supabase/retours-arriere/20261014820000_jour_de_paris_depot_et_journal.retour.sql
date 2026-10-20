-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014820000_jour_de_paris_depot_et_journal.sql (lot « fuseau-suite », 1/2)
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
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014820000_jour_de_paris_depot_et_journal.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : entre minuit et 1 h (hiver) ou 2 h (été) à Paris, un dépôt de garantie encaissé sans date, sa
-- pièce comptable, la contre-écriture d'un dépôt retiré et l'imputation d'une contre-écriture passée depuis le journal sont de
-- nouveau datés de la veille (le jour UTC), ainsi qu'une écriture ou un dépôt écrits sans date.
-- Ne modifie aucune donnée : dépôts, écritures et contre-écritures déjà datés gardent leur date.
-- Le retour rétablit `current_date` en minuscules ; c'est la casse d'origine des corps de ces fonctions.
--
-- À jouer AVANT le retour de 20261014500000 (qui refuse tant qu'un objet cite encore la fonction du jour de Paris).

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

do $retour_arriere$
declare
  -- signature, puis nombre exact de `public.aujourdhui_paris()` posés par la migration dans la définition en vigueur.
  v_cibles constant text[][] := array[
    ['public.encaisser_depot(uuid,numeric,date,text,uuid,text,uuid)', '3'],
    ['public.contre_passer_depot_encaissement()', '2'],
    ['public.contre_ecriture(uuid,text)', '1']
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

-- Valeurs par défaut : de nouveau le jour de la session. Un défaut à l'expression explicite du jour de Paris n'a pas été posé par
-- la migration (elle l'a trouvé et laissé) : il reste tel quel.
do $retour_arriere$
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
    if v_defaut ~* '^(public\.)?aujourdhui_paris\(\)$' then
      execute format('alter table public.%I alter column %I set default current_date', v_colonnes[v_i][1], v_colonnes[v_i][2]);
    elsif v_defaut ~* '^current_date$' then
      raise notice '%.% : déjà current_date, rien à faire', v_colonnes[v_i][1], v_colonnes[v_i][2];
    elsif v_defaut ~* '^\(*\s*now\(\)\s+at\s+time\s+zone\s+''Europe/Paris''(::text)?\s*\)*\s*::\s*date\s*\)*$' then
      raise notice '%.% : jour de Paris posé par une autre migration, laissé tel quel', v_colonnes[v_i][1], v_colonnes[v_i][2];
    else
      raise exception 'Retour arrière : le défaut de %.% est « % » : base inattendue, rien n''est modifié.',
        v_colonnes[v_i][1], v_colonnes[v_i][2], coalesce(v_defaut, '(aucun)');
    end if;
  end loop;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014820000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
