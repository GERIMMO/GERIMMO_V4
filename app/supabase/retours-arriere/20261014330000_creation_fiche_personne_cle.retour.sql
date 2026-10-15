-- RETOUR ARRIÈRE de 20261014330000_creation_fiche_personne_cle.sql (décision D31, clé d'idempotence de la création d'une fiche personne)
--
-- NE PAS PLACER dans app/supabase/migrations/ et NE JAMAIS le passer à migrations.yml : ce fichier
-- défait une migration, il se joue À LA MAIN, une fois décidé, avec la procédure de LISEZ-MOI.md.
-- Une seule transaction : la moindre erreur annule tout, la base reste alors telle qu'elle était.
--
-- Cette migration n'a créé aucune fonction : elle a ajouté UNE colonne facultative (persons.creation_cle) et UN index
-- unique partiel (persons_creation_cle_unique). Le retour les retire. Aucune fiche n'est supprimée ni modifiée : seules
-- disparaissent les clés d'idempotence des fiches créées depuis la migration (elles ne portent aucune donnée personnelle
-- et ne servent qu'à reconnaître un renvoi de la même demande).
--
-- ORDRE À RESPECTER : remettre d'abord en production le CODE d'avant (celui qui n'envoie pas `creation_cle`). Le code de la
-- décision D31 écrit cette colonne à chaque création de fiche faite depuis l'assistant : sans elle, ces créations échoueraient
-- (« column creation_cle does not exist »). Les créations faites depuis l'étape « bail » n'envoient pas de clé et ne sont pas touchées.
--
-- RÉINTRODUIT le défaut corrigé (PR178-A-03) : après une réponse perdue, l'écran de création de fiche ne peut plus savoir si la fiche
-- existe et ferme son bouton (ressaisie complète, nouveau choix des fichiers) ; deux envois simultanés de la même demande ne sont plus
-- reconnus comme un seul. NE DÉFAIT PAS les fiches créées entre-temps : elles restent, sans leur clé.
--
-- Rejouable : sur une base déjà revenue, chaque étape répond « rien à faire ».
-- Usage : psql "$URL" -v ON_ERROR_STOP=1 -f 20261014330000_creation_fiche_personne_cle.retour.sql

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

-- 1/2 L'index d'abord : sans lui, la colonne n'est plus utile et son retrait ne coûte rien.
do $retour_arriere$
declare v_nb bigint := 0;
begin
  if to_regclass('public.persons_creation_cle_unique') is null then
    raise notice 'persons_creation_cle_unique : absent, rien à faire';
  else
    drop index public.persons_creation_cle_unique;
    raise notice 'persons_creation_cle_unique : supprimé';
  end if;

  -- 2/2 La colonne ensuite. On dit combien de clés disparaissent (information, pas une condition).
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'persons' and column_name = 'creation_cle') then
    execute 'select count(*) from public.persons where creation_cle is not null' into v_nb;
    alter table public.persons drop column creation_cle;
    raise notice 'persons.creation_cle : supprimée (% clé(s) d''idempotence retirée(s), aucune fiche supprimée)', v_nb;
  else
    raise notice 'persons.creation_cle : absente, rien à faire';
  end if;
end $retour_arriere$;

-- Convention de toute migration qui touche une fonction (aucune ici : sans effet, par prudence).
select public.fermer_fonctions_a_anon();

-- La version n'est plus « appliquée » : sans cela migrations.yml refuserait de la rejouer (garde « version déjà enregistrée »).
do $retour_arriere$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261014330000';
  end if;
end $retour_arriere$;

commit;

-- Vérification (lecture seule) : « antérieure (A) » attendue après le retour, « migrée (B) » avant.
select 'persons.creation_cle' as objet,
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'persons' and column_name = 'creation_cle')
            then 'migrée (B)' else 'antérieure (A)' end as etat
union all
select 'index persons_creation_cle_unique',
       case when to_regclass('public.persons_creation_cle_unique') is not null then 'migrée (B)' else 'antérieure (A)' end;
