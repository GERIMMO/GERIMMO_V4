-- Clé d'envoi de l'écriture libre (D05, fiche PR178-B-06), 3/3. Même patron que l'encaissement de loyer
-- (20261014100000) : colonne facultative `cle_envoi` + index unique partiel, par organisation.
--
-- L'écriture libre de la comptabilité s'insère par PostgREST, sous les droits de COLONNE posés en 20260929110000
-- (le client ne pose ni `systeme`, ni `bail_id`, ni `encaissement_id`) : la clé doit donc être ajoutée à la liste des
-- colonnes insérables, et à elle seule. La lecture (`select`) est déjà ouverte à la table entière.
--
-- Une saisie peut produire DEUX lignes (taxe foncière et TEOM, ventilées par l'application dans une seule instruction) :
-- la clé n'est posée que sur la PREMIÈRE ligne de la saisie. L'insertion étant une seule instruction, le rejeu d'une
-- saisie à deux lignes est refusé tout entier par l'unicité de la clé de la première.
--
-- Rien n'est réécrit : les écritures existantes gardent NULL. Rejouable sans effet. Aucune fonction n'est touchée.
-- Retour arrière : supabase/retours-arriere/20261014102000_cle_envoi_ecriture_libre.retour.sql.

alter table public.ecritures add column if not exists cle_envoi uuid;

create unique index if not exists ecritures_cle_envoi_unique
  on public.ecritures (organization_id, cle_envoi)
  where cle_envoi is not null;

comment on column public.ecritures.cle_envoi is
  'Clé d''envoi du formulaire (UUID, D05) : une même saisie n''écrit qu''une fois. Posée sur la première ligne d''une saisie ventilée ; NULL ailleurs.';

grant insert (cle_envoi) on table public.ecritures to authenticated;

select public.fermer_fonctions_a_anon();
