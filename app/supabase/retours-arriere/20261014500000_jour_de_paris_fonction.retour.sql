-- RETOUR ARRIÈRE de 20261014500000_jour_de_paris_fonction.sql (lot « fuseau-paris », 1/5)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Il retire la fonction `public.aujourdhui_paris()`. À JOUER EN DERNIER, après les retours de 20261014504000, …503000,
-- …502000 et …501000 : tant qu'un objet s'en sert encore (une fonction qui la cite, ou la valeur par défaut d'une colonne),
-- le script REFUSE et nomme ce qui s'en sert. Il n'efface donc jamais une fonction sous un appel qui la nomme.
-- Rejouable : une fonction déjà retirée n'est pas une erreur.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014500000_jour_de_paris_fonction.retour.sql
--
-- Ne modifie aucune donnée et aucun autre objet.

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
  v_oid regprocedure := to_regprocedure('public.aujourdhui_paris()');
  v_fonctions text;
  v_dependances text;
begin
  if v_oid is null then
    raise notice 'public.aujourdhui_paris() : déjà retirée, rien à faire';
    return;
  end if;

  -- Les fonctions qui la citent encore (le texte d'une fonction ne laisse aucune dépendance dans le catalogue).
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text) into v_fonctions
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p') and p.oid <> v_oid
     and pg_get_functiondef(p.oid) ~ 'aujourdhui_paris\(\)';
  if v_fonctions is not null then
    raise exception 'Retour arrière refusé : ces fonctions citent encore public.aujourdhui_paris() : %. Jouez d''abord les retours de 20261014504000, 20261014503000, 20261014502000 et 20261014501000.', v_fonctions;
  end if;

  -- Ce qui en dépend dans le catalogue : valeurs par défaut de colonnes, vues, contraintes, politiques.
  select string_agg(distinct coalesce(
           (select ad.adrelid::regclass::text || '.' || a.attname from pg_attrdef ad join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum where ad.oid = d.objid and d.classid = 'pg_attrdef'::regclass),
           d.classid::regclass::text || ' ' || d.objid::text), ', ') into v_dependances
    from pg_depend d
   where d.refclassid = 'pg_proc'::regclass and d.refobjid = v_oid and d.deptype = 'n';
  if v_dependances is not null then
    raise exception 'Retour arrière refusé : public.aujourdhui_paris() sert encore à : %. Jouez d''abord les retours des migrations qui la posent.', v_dependances;
  end if;

  drop function public.aujourdhui_paris();
end $retour_arriere$;

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014500000';
  end if;
end $retour_arriere$;

commit;
