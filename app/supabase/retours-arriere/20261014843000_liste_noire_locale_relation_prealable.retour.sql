-- RETOUR ARRIÈRE de 20261014843000_liste_noire_locale_relation_prealable.sql (relecture du 15/10/2026 du lot
-- « invitation-artisan » : la liste noire locale exige une relation préalable réelle).
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Chirurgical : la définition EN VIGUEUR de `artisan_blacklist_locale` est relue, et le seul morceau posé par la
-- migration (le bloc de la relation préalable, avec sa marque, devant le décompte des interventions en cours) est retiré :
-- la ligne d'ancre reste seule, comme avant. Un correctif posé depuis par une autre migration ailleurs dans la fonction
-- est conservé. Rejouable : sans le morceau de la migration, la fonction est laissée telle quelle. Droits inchangés.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014843000_liste_noire_locale_relation_prealable.retour.sql
--
-- RÉINTRODUIT le défaut corrigé : une organisation peut de nouveau mettre sur sa liste noire un artisan avec lequel elle
-- n'a aucune relation, ce qui lui crée une ligne de carnet et lui ouvre la fiche de l'entreprise (et sert d'oracle sur
-- l'existence d'un identifiant). Ordre indifférent avec le code : l'application ne dépend pas de ce correctif.
-- Si le retour de 20261014601000 doit aussi être joué : celui-ci D'ABORD (601000 rétablit la fonction en entier).

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
  c_nouveau constant text := $nouveau$  -- Relecture du 15/10 (liste noire à l'aveugle) : une relation préalable réelle, voir 20261014843000.
  if not (exists (select 1 from public.artisan_agences aa where aa.organization_id = p_org and aa.artisan_id = p_artisan)
          or exists (select 1 from public.incident_sollicitations s where s.organization_id = p_org and s.artisan_id = p_artisan)
          or exists (select 1 from public.incident_interventions ir where ir.organization_id = p_org and ir.artisan_id = p_artisan)
          or exists (select 1 from public.incident_devis d where d.organization_id = p_org and d.artisan_id = p_artisan)) then
    raise exception 'Cet artisan n’est pas en relation avec votre organisation : il ne peut pas être mis sur votre liste noire';
  end if;
  select count(*) into v_en_cours from public.incident_interventions i$nouveau$;
  c_ancre constant text := $ancre$  select count(*) into v_en_cours from public.incident_interventions i$ancre$;
begin
  select pg_get_functiondef('public.artisan_blacklist_locale(uuid,uuid,text)'::regprocedure) into v_def;
  if position(c_nouveau in v_def) = 0 then
    raise notice 'artisan_blacklist_locale : correctif absent, rien à faire';
    return;
  end if;
  execute replace(v_def, c_nouveau, c_ancre);
  raise notice 'artisan_blacklist_locale : bloc de la relation préalable retiré';
end $retour_arriere$;

revoke all on function public.artisan_blacklist_locale(uuid, uuid, text) from public, anon;
grant execute on function public.artisan_blacklist_locale(uuid, uuid, text) to authenticated;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014843000';
  end if;
end $retour_arriere$;

commit;

-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'artisan_blacklist_locale' as objet,
       case when position('Relecture du 15/10 (liste noire à l''aveugle)'
                          in pg_get_functiondef('public.artisan_blacklist_locale(uuid,uuid,text)'::regprocedure)) > 0
            then 'migrée (B)' else 'antérieure (A)' end as etat;
