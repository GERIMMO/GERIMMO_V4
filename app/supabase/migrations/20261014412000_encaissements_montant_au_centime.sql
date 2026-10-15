-- Décision X09 du 14 octobre 2026 (fiche FIN-03), recommandation suivie : une contrainte de centime sur les encaissements.
--
-- Avant : rien n'empêchait la base de recevoir 100,005 € par une requête directe (le champ du formulaire dit step="0.01" et l'action
-- serveur refuse déjà au-delà du centime depuis le 13/10, mais un client qui contourne le navigateur et l'action écrit dans la table).
-- La pièce comptable reprend ce montant ; la capture fiscale, elle, répartit en composantes arrondies (92,60 + 7,41 = 100,01) : l'écart
-- de 0,005 € ne se réconcilie plus jamais, la pièce reste bloquée sans issue.
-- Maintenant : CHECK (montant = round(montant, 2)) sur public.encaissements, posée NOT VALID.
--
-- NOT VALID = la contrainte s'applique à toute NOUVELLE insertion et à toute modification de montant, mais PostgreSQL ne relit pas
-- les lignes existantes : rien n'est vérifié, rien n'est réécrit, aucun encaissement passé n'est modifié ni refusé. Le relevé de
-- production du dossier de validation (13/10/2026) montre 0 encaissement au-delà du centime et 0 écriture au-delà du centime ; la
-- contrainte pourra être validée (ALTER TABLE … VALIDATE CONSTRAINT, sans verrou bloquant l'écriture) quand le dirigeant le décidera,
-- après un nouveau relevé.
--
-- Périmètre : les montants d'ENCAISSEMENT (public.encaissements). La table des écritures n'est pas touchée : ses montants viennent
-- de l'encaissement (déclencheur) ou de saisies déjà lues au centime près ; l'étendre est une décision à part.
--
-- Rejouable sans effet : si la contrainte existe déjà, il n'y a rien à faire. Aucune fonction n'est touchée : pas de droit à poser.
-- Retour arrière : supabase/retours-arriere/20261014412000_encaissements_montant_au_centime.retour.sql

do $correctif$
begin
  if exists (select 1 from pg_constraint
             where conrelid = 'public.encaissements'::regclass
               and conname = 'encaissements_montant_centime_check') then
    return;
  end if;
  alter table public.encaissements
    add constraint encaissements_montant_centime_check check (montant = round(montant, 2)) not valid;
end $correctif$;

comment on constraint encaissements_montant_centime_check on public.encaissements is
  'Un encaissement s''exprime au centime près (X09, FIN-03). Posée NOT VALID : les encaissements existants ne sont ni relus ni modifiés.';
