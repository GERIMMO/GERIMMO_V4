-- RETOUR ARRIÈRE de 20261014841000_metiers_zones_sans_proprietaire.sql (relecture du 15/10/2026 du lot
-- « invitation-artisan » : un propriétaire direct ne modifie plus les métiers ni la zone d'un artisan).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Chirurgical : la définition EN VIGUEUR de `artisan_definir_metiers_zones` est relue, et le seul morceau posé par la
-- migration (la liste des rôles sans `proprietaire_direct`, suivie de sa marque) redevient la liste d'origine de
-- 20260911180000. Un correctif posé depuis par une autre migration ailleurs dans la fonction est conservé. Rejouable :
-- sans le morceau de la migration, la fonction est laissée telle quelle. Droits inchangés (les mêmes avant et après).
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014841000_metiers_zones_sans_proprietaire.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : un propriétaire direct qui a un artisan dans son carnet (invitation acceptée) peut de
-- nouveau réécrire les métiers et la zone de cet artisan — profil commun à toutes les organisations et au réseau — et le
-- solliciter ainsi hors de sa zone, commune fermée comprise. Aucun écran ne le propose : seul un appel direct le fait.
-- Ordre indifférent avec le code : l'application ne dépend pas de ce correctif.

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
  v_def text;
  c_nouveau constant text := $nouveau$and m.role in ('admin_agence','agent')) -- Relecture du 15/10 (invitation d'artisan) : jamais un propriétaire direct, voir 20261014841000.$nouveau$;
  c_ancre constant text := $ancre$and m.role in ('admin_agence','agent','proprietaire_direct'))$ancre$;
begin
  select pg_get_functiondef('public.artisan_definir_metiers_zones(uuid,public.artisan_metier[],text[])'::regprocedure) into v_def;
  if position(c_nouveau in v_def) = 0 then
    raise notice 'artisan_definir_metiers_zones : correctif absent, rien à faire';
    return;
  end if;
  execute replace(v_def, c_nouveau, c_ancre);
  raise notice 'artisan_definir_metiers_zones : liste des rôles d''origine rétablie';
end $retour_arriere$;

revoke all on function public.artisan_definir_metiers_zones(uuid, public.artisan_metier[], text[]) from public, anon;
grant execute on function public.artisan_definir_metiers_zones(uuid, public.artisan_metier[], text[]) to authenticated;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014841000';
  end if;
end $retour_arriere$;

commit;

-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'artisan_definir_metiers_zones' as objet,
       case when position('Relecture du 15/10 (invitation d''artisan)'
                          in pg_get_functiondef('public.artisan_definir_metiers_zones(uuid,public.artisan_metier[],text[])'::regprocedure)) > 0
            then 'migrée (B)' else 'antérieure (A)' end as etat;
