-- Instruction atomique ; participe à une transaction externe sans la valider.
do $retour_atomique$
begin
 execute $instructions_retour$
-- RETOUR ARRIÈRE de 20261014310000_artisan_facture_numero_unique.sql (lot « artisan-externe », décision D24-B)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Méthode : CHIRURGICALE. La migration n'a fait qu'AJOUTER un bloc, délimité par deux marques
-- (« -- >> Audit du 14/10 (ARC-04) » et « -- << Audit du 14/10 (ARC-04) »), à la définition de
-- artisan_externe_ecrire en vigueur à ce moment-là. Ce script relit la définition d'AUJOURD'HUI et en retire
-- exactement ce bloc : il ne rétablit pas une vieille copie, donc il n'efface aucune modification apportée
-- depuis par une autre migration. Aucune définition n'est écrite de mémoire. Il se rejoue sans effet : sans
-- la marque, la fonction est laissée telle quelle. S'il trouve la marque mais pas un bloc intact (marque
-- retouchée, bloc répété), il s'arrête sans rien modifier.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014310000_artisan_facture_numero_unique.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (ARC-04) : « art-2026-0001 » est de nouveau accepté à côté de « ART-2026-0001 »,
-- et le numéro d'une facture que Gerimmo a déjà reçue de l'artisan n'est plus comparé. NE TOUCHE AUCUNE DONNÉE :
-- aucune facture n'est lue ni modifiée ; seuls l'index unique et le bloc de contrôle disparaissent.
-- La contrainte d'origine unique(artisan_id, numero) reste en place.
--
-- Indépendant de 20261014311000_artisan_exclusion_ecritures.retour.sql (ils retirent des blocs différents :
-- dans l'un ou l'autre ordre, le résultat est le même).

-- Enveloppe atomique : la transaction appelante reste maître de sa validation.

set local lock_timeout = '10s';

-- 1/3. Le bloc de contrôle du numéro, retiré de la définition en vigueur (et d'elle seule).
do $retour_arriere$
declare
  v_def text;
  v_debut text := '-- >> Audit du 14/10 (ARC-04)';
  v_fin text := E'-- << Audit du 14/10 (ARC-04)\n   ';
  p_debut int; p_fin int;
begin
  select pg_get_functiondef('public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid)'::regprocedure) into v_def;
  p_debut := position(v_debut in v_def);
  if p_debut = 0 then
    raise notice 'artisan_externe_ecrire : marque ARC-04 absente, rien à faire';
    return;
  end if;
  p_fin := position(v_fin in v_def);
  if p_fin = 0 or p_fin < p_debut
     or (length(v_def) - length(replace(v_def, v_debut, ''))) <> length(v_debut)
     or (length(v_def) - length(replace(v_def, v_fin, ''))) <> length(v_fin) then
    raise exception 'Retour arrière refusé, rien n''a été modifié : le bloc ARC-04 de artisan_externe_ecrire n''est plus intact (marques retouchées ou répétées). Le retirer à la main.';
  end if;
  execute left(v_def, p_debut - 1) || substr(v_def, p_fin + length(v_fin));
  raise notice 'artisan_externe_ecrire : bloc ARC-04 retiré';
end $retour_arriere$;

revoke all on function public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid) from public, anon;
grant execute on function public.artisan_externe_ecrire(text,uuid,integer,jsonb,uuid) to authenticated;

-- 2/3. L'index unique (aucune donnée n'est touchée).
drop index if exists public.artisan_factures_externes_numero_normalise_key;

-- Convention de toute migration qui touche une fonction.
select public.fermer_fonctions_a_anon();

-- 3/3. La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014310000';
  end if;
end $retour_arriere$;
$instructions_retour$;
end $retour_atomique$;
