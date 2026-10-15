-- Décision X09 du 14 octobre 2026 (fiche FIN-03), constat de relecture du 15/10 : un encaissement est un nombre fini.
--
-- Avant : la contrainte de centime (20261014412000, montant = round(montant, 2)) et la contrainte de signe d'origine (montant > 0) sont
-- toutes deux VRAIES pour le « nombre » NaN de numeric (NaN est égal à lui-même et supérieur à tout nombre). Une requête directe d'un
-- compte connecté, insert into encaissements(montant) values ('NaN'), était donc ACCEPTÉE : le loyer passait de « impayé » à « payé »
-- et une quittance était générée. C'est le contournement par requête directe que la contrainte de centime devait fermer.
-- L'infini (Infinity) était arrêté plus loin, par un dépassement numérique de la capture fiscale : un refus par accident, avec un
-- message qui n'a rien à voir.
-- Maintenant : une seconde contrainte, encaissements_montant_fini_check (montant <> 'NaN' et montant <> 'Infinity'), refuse l'un et l'autre
-- dès l'insertion ou la modification du montant. (-Infinity est déjà refusé par la contrainte de signe.)
--
-- Posée NOT VALID, comme la contrainte de centime : elle s'applique à toute NOUVELLE insertion et à toute modification de montant, mais
-- PostgreSQL ne relit pas les lignes existantes. Rien n'est vérifié, rien n'est réécrit, aucun encaissement passé n'est modifié ni refusé.
-- Elle pourra être validée (ALTER TABLE … VALIDATE CONSTRAINT) avec la contrainte de centime, quand le dirigeant le décidera, après le relevé :
--   select count(*) from public.encaissements where montant = 'NaN' or montant = 'Infinity';   -- doit rendre zéro
--
-- Une contrainte de plus plutôt qu'une contrainte remplacée : la contrainte de centime reste telle que la migration 20261014412000 l'a posée
-- (sa définition, sa validité éventuelle), et le retour arrière de celle-ci n'a rien à connaître de cette migration.
--
-- Périmètre : les montants d'ENCAISSEMENT (public.encaissements), comme la décision X09. La table des écritures n'est PAS touchée : son
-- contrôle de signe (montant > 0) laisse lui aussi passer NaN par une requête directe sur cette table. L'étendre est une décision à part,
-- que ce lot soumet au dirigeant ; il n'y a pas de fonction à poser ni de droit à toucher.
--
-- Rejouable sans effet : si la contrainte existe déjà, il n'y a rien à faire.
-- Retour arrière : supabase/retours-arriere/20261014414000_encaissements_montant_fini.retour.sql

do $correctif$
begin
  if exists (select 1 from pg_constraint
             where conrelid = 'public.encaissements'::regclass
               and conname = 'encaissements_montant_fini_check') then
    return;
  end if;
  alter table public.encaissements
    add constraint encaissements_montant_fini_check check (montant <> 'NaN'::numeric and montant <> 'Infinity'::numeric) not valid;
end $correctif$;

comment on constraint encaissements_montant_fini_check on public.encaissements is
  'Un encaissement est un nombre fini : ni NaN ni Infinity (X09, FIN-03, constat de relecture du 15/10). Posée NOT VALID : les encaissements existants ne sont ni relus ni modifiés.';
