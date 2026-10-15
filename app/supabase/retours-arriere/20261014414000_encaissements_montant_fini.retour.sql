-- RETOUR ARRIÈRE de 20261014414000_encaissements_montant_fini.sql
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Défait : la contrainte `encaissements_montant_fini_check` (CHECK (montant <> 'NaN' and montant <> 'Infinity'), posée NOT VALID).
-- Aucune fonction n'était touchée par la migration : rien à restaurer. Aucune donnée n'est réécrite ni supprimée : la contrainte
-- ne relisait pas les lignes existantes, elle ne fait que disparaître. La contrainte de centime (20261014412000) n'est pas touchée.
--
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014414000_encaissements_montant_fini.retour.sql
--
-- RÉINTRODUIT le défaut corrigé (constat de relecture du 15/10 sur FIN-03) : une requête directe d'un compte connecté peut de nouveau
-- écrire un encaissement « NaN » (qui solde un loyer et génère une quittance) ; « Infinity » n'est plus arrêté que par un dépassement
-- numérique de la capture fiscale.
-- Rejouable : sans la contrainte, l'instruction ne fait rien.

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

-- Dit combien d'encaissements ne sont pas des nombres finis aujourd'hui (information, pas un refus : rien n'est modifié).
do $retour_arriere$
declare v_hors bigint;
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.encaissements'::regclass and conname = 'encaissements_montant_fini_check') then
    select count(*) into v_hors from public.encaissements where montant = 'NaN'::numeric or montant = 'Infinity'::numeric;
    raise notice 'Retour arrière 20261014414000 : % encaissement(s) NaN ou Infinity (ils restent tels quels).', v_hors;
  else
    raise notice 'Retour arrière 20261014414000 : la contrainte est déjà absente, rien à faire.';
  end if;
end $retour_arriere$;

alter table public.encaissements drop constraint if exists encaissements_montant_fini_check;


-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014414000';
  end if;
end $retour_arriere$;

commit;
