-- RETOUR ARRIÈRE de 20261014311000_artisan_exclusion_ecritures.sql (lot « artisan-externe », décision D25-B)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Méthode : CHIRURGICALE, comme 20261014310000_artisan_facture_numero_unique.retour.sql. La migration n'a fait
-- qu'AJOUTER (a) un bloc délimité par « -- >> Audit du 14/10 (ARC-08) » et « -- << Audit du 14/10 (ARC-08) » dans
-- artisan_externe_ecrire, (b) la clé 'exclusion' de la fonction de lecture mon_activite_artisan_privee, (c) la fonction
-- artisan_exclusion_plateforme(). Ce script relit les définitions d'AUJOURD'HUI et en retire exactement ces ajouts :
-- il n'efface aucune modification apportée depuis par une autre migration, et aucune définition n'est écrite de
-- mémoire. Il se rejoue sans effet. S'il trouve une marque sans bloc intact, il s'arrête sans rien modifier.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014311000_artisan_exclusion_ecritures.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (ARC-08) : un artisan refusé par la plateforme ou sur la liste noire globale
-- peut de nouveau créer des clients, des chantiers, des devis et des factures. NE TOUCHE AUCUNE DONNÉE : le statut
-- « refusé » et la liste noire d'un artisan ne sont ni lus ni modifiés ; seule la garde disparaît.
--
-- Indépendant de 20261014310000_artisan_facture_numero_unique.retour.sql (ils retirent des blocs différents :
-- dans l'un ou l'autre ordre, le résultat est le même).

-- Garde : ce script ouvre et ferme SA transaction. Placé dans un lot déjà ouvert (begin; … rollback; de
-- migrations.yml), son commit validerait tout le lot et la « simulation » ne simulerait plus rien.
-- Hors transaction, l'instruction démarre à l'instant même de sa transaction ; dans un lot, elle est plus tardive.
do $retour_arriere$
begin
  if statement_timestamp() <> transaction_timestamp() then
    raise exception 'Retour arrière refusé : ce script gère sa propre transaction et ne doit pas être joué dans un lot (migrations.yml, psql --single-transaction, begin;). Voir LISEZ-MOI.md.';
  end if;
end $retour_arriere$;

-- Pré-contrôle en lecture seule, avant tout travail : si une AUTRE fonction appelle artisan_exclusion_plateforme()
-- (écrite après cette migration), la supprimer la casserait. On s'arrête, sans rien modifier.
do $retour_arriere$
declare v_autres text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_autres
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.proname not in ('artisan_exclusion_plateforme', 'artisan_externe_ecrire', 'mon_activite_artisan_privee')
     and p.prosrc like '%artisan_exclusion_plateforme%';
  if v_autres is not null then
    raise exception 'RETOUR ARRIÈRE REFUSÉ, rien n''a été modifié : artisan_exclusion_plateforme() est appelée par % (écrit(e) après la migration). Voir LISEZ-MOI.md.', v_autres;
  end if;
end $retour_arriere$;

begin;
set local lock_timeout = '10s';

-- 1/4. Le bloc de refus, retiré de artisan_externe_ecrire (et d'elle seule).
do $retour_arriere$
declare
  v_def text;
  v_debut text := E'\n -- >> Audit du 14/10 (ARC-08)';
  v_fin text := '-- << Audit du 14/10 (ARC-08)';
  p_debut int; p_fin int;
begin
  select pg_get_functiondef('public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)'::regprocedure) into v_def;
  p_debut := position(v_debut in v_def);
  if p_debut = 0 then
    raise notice 'artisan_externe_ecrire : marque ARC-08 absente, rien à faire';
    return;
  end if;
  p_fin := position(v_fin in v_def);
  if p_fin = 0 or p_fin < p_debut
     or (length(v_def) - length(replace(v_def, v_debut, ''))) <> length(v_debut)
     or (length(v_def) - length(replace(v_def, v_fin, ''))) <> length(v_fin) then
    raise exception 'Retour arrière refusé, rien n''a été modifié : le bloc ARC-08 de artisan_externe_ecrire n''est plus intact (marques retouchées ou répétées). Le retirer à la main.';
  end if;
  execute left(v_def, p_debut - 1) || substr(v_def, p_fin + length(v_fin));
  raise notice 'artisan_externe_ecrire : bloc ARC-08 retiré';
end $retour_arriere$;

-- 2/4. La clé 'exclusion' de la lecture (l'export garde tout le reste).
do $retour_arriere$
declare
  v_def text;
  v_ajout text := $ajout$,'exclusion',public.artisan_exclusion_plateforme()$ajout$;
begin
  select pg_get_functiondef('public.mon_activite_artisan_privee()'::regprocedure) into v_def;
  if position(v_ajout in v_def) = 0 then
    raise notice 'mon_activite_artisan_privee : clé exclusion absente, rien à faire';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ajout, ''))) <> length(v_ajout) then
    raise exception 'Retour arrière refusé, rien n''a été modifié : la clé exclusion de mon_activite_artisan_privee est répétée. La retirer à la main.';
  end if;
  execute replace(v_def, v_ajout, '');
  raise notice 'mon_activite_artisan_privee : clé exclusion retirée';
end $retour_arriere$;

revoke all on function public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid) from public, anon;
grant execute on function public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid) to authenticated;
revoke all on function public.mon_activite_artisan_privee() from public, anon;
grant execute on function public.mon_activite_artisan_privee() to authenticated;

-- 3/4. La fonction de contrôle, SANS cascade : une dépendance inattendue arrête tout.
drop function if exists public.artisan_exclusion_plateforme();

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- 4/4. La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014311000';
  end if;
end $retour_arriere$;

commit;
