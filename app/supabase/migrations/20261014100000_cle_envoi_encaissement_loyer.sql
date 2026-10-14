-- Clé d'envoi de l'encaissement de loyer (D05, fiche PR178-B-06), 1/3.
--
-- Décision du dirigeant du 14/10/2026 : un encaissement ne se rejoue pas après une réponse perdue. Le formulaire
-- produit une clé (un UUID par instance de formulaire) et la rejoue telle quelle à chaque nouvel envoi ; la base
-- rend cette clé unique. Un second envoi de la même clé n'écrit rien : ni encaissement, ni reçu, ni quittance
-- (ils naissent du déclencheur d'insertion, qui ne s'exécute pas quand l'insertion est refusée).
--
-- Patron déjà en production : retours_utilisateurs.cle_envoi (20260914120000) et biens.creation_cle (20261013103000).
--
-- Colonne FACULTATIVE : les encaissements existants gardent NULL, rien n'est réécrit, aucune ligne n'est
-- dédoublonnée. L'index est PARTIEL (clé non nulle seulement) : les saisies sans clé (rattrapages, import,
-- « Encaisser le reste ») restent possibles comme avant. L'unicité vaut par organisation : la clé d'un envoi
-- ne désigne jamais un encaissement d'une autre organisation.
--
-- Rejouable sans effet (if not exists). Aucune fonction n'est touchée : pas de droit à poser. Retour arrière :
-- supabase/retours-arriere/20261014100000_cle_envoi_encaissement_loyer.retour.sql.

alter table public.encaissements add column if not exists cle_envoi uuid;

create unique index if not exists encaissements_cle_envoi_unique
  on public.encaissements (organization_id, cle_envoi)
  where cle_envoi is not null;

comment on column public.encaissements.cle_envoi is
  'Clé d''envoi du formulaire (UUID, D05) : un même envoi n''encaisse qu''une fois. NULL pour les saisies sans formulaire.';
