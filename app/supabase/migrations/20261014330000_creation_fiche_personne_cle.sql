-- Décision D31 (PR178-A-03, relevé du 13 octobre 2026) : une clé d'idempotence pour la
-- création d'une fiche personne, sur le patron « creation_cle » du parc (biens).
--
-- Problème : quand la réponse de la création d'une fiche est perdue, l'écran ne sait pas
-- si la fiche existe. Il désactivait donc le bouton pour toujours (ressaisie complète et
-- nouveau choix des fichiers). Avec une clé tirée une fois par l'écran et conservée avec
-- la copie locale, le renvoi de la même demande retrouve la fiche déjà créée au lieu d'en
-- créer une seconde, et l'écran peut proposer de réessayer sans risque de doublon.
--
-- Migration ADDITIVE et rejouable :
--   · une colonne facultative (NULL partout pour les fiches existantes : aucune ligne n'est
--     réécrite, aucune déduplication ni reprise par supposition) ;
--   · un index unique PARTIEL (seules les lignes qui portent une clé y entrent) : deux
--     demandes simultanées de même clé ne peuvent pas créer deux fiches, la seconde attend
--     la première puis est refusée par l'index, et l'action la traite comme un rejeu.
-- Aucune fonction n'est créée ni modifiée. La clé ne contient aucune donnée personnelle :
-- la saisie n'est PAS recopiée en base (contrairement à biens.creation_requete) afin de ne
-- pas dupliquer des données personnelles hors des colonnes que l'anonymisation connaît ;
-- l'action compare la demande rejouée à la fiche enregistrée.
-- Les appelants qui n'envoient pas de clé (création depuis l'étape « bail ») gardent le
-- comportement d'avant.
-- À appliquer par `migrations.yml` (simulation d'abord), comme toute migration.

alter table public.persons add column if not exists creation_cle uuid;

comment on column public.persons.creation_cle is
  'Clé d''idempotence de la demande de création de la fiche (tirée par l''écran, conservée avec sa copie locale). NULL pour toute fiche créée sans clé. Décision D31.';

-- Unique par organisation : la clé est un UUID aléatoire tiré par le navigateur de l'auteur, et
-- la lecture de rejeu passe par la RLS de l'appelant (un agent restreint ne retrouve pas une
-- fiche hors de son portefeuille).
create unique index if not exists persons_creation_cle_unique
  on public.persons (organization_id, creation_cle)
  where creation_cle is not null;

-- Rejeu : si un index du même nom existait déjà avec une autre définition, `if not exists` l'aurait laissé
-- tel quel et la garantie d'unicité serait fausse. On s'arrête plutôt que de le taire.
do $controle$
declare v_def text;
begin
  select pg_get_indexdef(i.indexrelid) into v_def
    from pg_index i
   where i.indexrelid = to_regclass('public.persons_creation_cle_unique');
  if v_def is null
     or v_def not like '%UNIQUE%'
     or v_def not like '%(organization_id, creation_cle)%'
     or v_def not like '%creation_cle IS NOT NULL%' then
    raise exception 'Index persons_creation_cle_unique : définition inattendue (%)', coalesce(v_def, 'absent');
  end if;
end $controle$;

-- Convention de toute migration (aucune fonction n'est touchée ici : sans effet, par prudence).
select public.fermer_fonctions_a_anon();
