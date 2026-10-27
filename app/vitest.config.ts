import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

/**
 * Fichiers qui ont besoin de la base de test POUR EUX SEULS : ils tournent après tous les autres, un fichier à la fois.
 *
 * Les tests adossés à la base partagent une seule base locale, et vitest lance plusieurs fichiers en même temps. Trois
 * situations ne supportent pas ce voisinage (constat de relecture du 14/10/2026, boucle de 40 passes : 3 échecs de
 * reprise-comptable.test.ts, 1 blocage mutuel de correctifs-audit.test.ts) :
 *  - une fixture VALIDÉE (deux sessions ne se voient qu'après un commit) reste visible de toutes les sessions pendant
 *    l'essai, et fait échouer les tests qui comptent « toute la table » (reprise-comptable.test.ts compte les dépôts) ;
 *  - un DDL tenu pendant tout le fichier (rejeu de migration, `create trigger` d'essai) pose un verrou de table qui se
 *    croise avec les écritures des autres fichiers : blocage mutuel (`deadlock detected`), la base tue l'un des deux ;
 *  - un `alter table … disable trigger` tenu pendant le test (suspension d'un déclencheur pour fabriquer un état
 *    d'avant la capture, constat de relecture du 15/10/2026) : le DDL pose un verrou de table jusqu'à la fin de la
 *    transaction du test, et deux fichiers qui suspendent chacun un déclencheur de `ecritures` ou d'`encaissements`
 *    se croisent avec les écritures de l'autre (`deadlock detected`, 16 échecs sur 30 passes avec ces deux seuls fichiers) ;
 *  - les deux à la fois.
 *
 * La CI (`npm test -- --maxWorkers=1`) lance déjà tout en série : ce classement ne change rien pour elle. Il protège
 * `npm test` en local. Le test `tests/execution-en-serie.test.ts` garde cette liste cohérente avec les fichiers.
 */
export const FICHIERS_EN_SERIE = [
  // Audit final (COD-02, 28/10) : retours des trois migrations du 26/10 joués puis rejoués dans la transaction de l'essai
  // (tables, fonctions et contrainte des baux supprimées puis recréées : verrous tenus pendant l'essai).
  "tests/retours-26-octobre-base.test.ts",
  // Audit final (COD-02) : chaque migration depuis le 28/10 rejouée deux fois dans une transaction annulée (DDL).
  "tests/migrations-rejouables-base.test.ts",
  // A01/A02 (23/10) : rejeu et retour de 20261023162446, pose complète des gardes, fixture validée (deux sessions).
  "tests/intention-souscription-base.test.ts",
  // Réseau d'artisans choisi par l'artisan (23/10) : rejeu de 20261023180000 et de son retour (index sur artisan_zones,
  // huit fonctions du réseau et artisan_definir_metiers_zones réécrites) dans la transaction du fichier.
  "tests/reseau-zone-artisan-rejeu.test.ts",
  // Relectures du 23/10 : verrous entre sollicitation du réseau et changement de zone, accès d'une agence revérifié sous
  // le verrou de la fiche ; fixture validée (deux sessions), nettoyée à la fin.
  "tests/reseau-zone-artisan-concurrence.test.ts",
  "tests/conservation-contacts-base.test.ts",
  "tests/reglage-souscription-base.test.ts",
  // Rejeu du compteur réservé au relais et fermeture des droits des fonctions.
  "tests/relais-agences-base.test.ts",
  "tests/artisan-activation-securite.test.ts",
  "tests/retours-atomicite.test.ts",
  // Rejeu transactionnel des droits Stripe et de la lecture de session (DDL).
  "tests/audit-oct20-migrations-rejeu.test.ts",
  "tests/stockage-gabarits-roles.test.ts",
  "tests/signature-preparation-abandon-base.test.ts",
  "tests/signature-suivi-base.test.ts",
  "tests/depot-direct-base.test.ts",
  // Réécriture temporaire des fonctions d’abonnement et du jour de Paris, annulée après chaque cas.
  "tests/abonnement-jour-paris-migration.test.ts",
  // Audit du 19/10 (B5) : rejeu de 20261019124000 et de son retour (drop/create de l'index signature_devis_une_offre, verrou
  // exclusif sur bail_signature_circuits) et horloge de Paris figée (réécriture temporaire d'aujourdhui_paris()).
  "tests/devis-signes-sort-et-jour-de-paris-rejeu.test.ts",
  // Fixtures historiques de signature manuelle : suspension temporaire du garde des nouveaux envois.
  "tests/audit-securite-2026-09-27.test.ts",
  "tests/supprimer-bail-brouillon-base.test.ts",
  // Repose tous les triggers métier : verrou DDL incompatible avec les écritures parallèles.
  "tests/retours-utilisateurs.test.ts",
  // Mission du 16/10 : retours de migrations, DDL exclusif et fixtures validées de concurrence.
  "tests/devis-rdv-complements-rejeu.test.ts",
  "tests/rdv-relance-concurrence-oct16.test.ts",
  "tests/traversee-lecture-seule-base.test.ts",
  "tests/confirmation-auth-migration-rejeu.test.ts",
  "tests/retour-adresse-confirmee-migration.test.ts",
  "tests/retours-oct16-registre.test.ts",
  "tests/relais-retention-sentinelle-oct16.test.ts",
  // Fixtures validées (concurrence entre deux sessions) + rejeu des migrations (DDL tenu pendant le fichier).
  "tests/cle-envoi-encaissements.test.ts",
  // Fixture validée (deux envois simultanés de la même clé).
  "tests/encaissement-cle-envoi-action.test.ts",
  // `create trigger` sur biens, persons, detentions, lots : verrou de table tenu pendant tout le fichier, en blocage
  // mutuel avec les écritures de correctifs-audit.test.ts (reproduit le 14/10 avec ces deux seuls fichiers).
  "tests/creation-bien-reprise.test.ts",
  // Fixture validée qui encaisse un dépôt (encaisser_depot) : une ligne de depot_encaissements visible ~160 ms de toutes
  // les sessions, mesurée le 14/10 ; même effet sur reprise-comptable.test.ts que les fixtures du lot « encaissement ».
  "tests/restitution-impayes.test.ts",
  // Lot « finance-dates » (X09, X13, X14) : `alter table public.encaissements` (retirer puis reposer la contrainte de centime, pour essayer
  // un encaissement ancien hors centime) et rejeu des migrations dans la transaction du test : verrou de table sur les encaissements,
  // qui se croiserait avec les écritures des autres fichiers.
  "tests/finance-dates-centime-plancher.test.ts",
  "tests/finance-dates-rejeu.test.ts",
  // `alter table ecritures / encaissements disable trigger` (état « d'avant la capture ») tenu pendant le fichier, plus une
  // fixture validée (transactions distinctes) : en blocage mutuel avec fiscalite-persistance.test.ts, qui fait de même.
  "tests/fiscalite-capture-multilignes.test.ts",
  // Même motif : `alter table ecritures disable trigger z_capturer_fiscalite` dans la transaction de ses essais.
  "tests/fiscalite-persistance.test.ts",
  // Rejeu des cinq migrations du jour de Paris et de leurs retours : `alter table … set default` sur encaissements,
  // quittances et relances, verrou exclusif tenu pendant tout l'essai, qui bloquerait les écritures des autres fichiers.
  "tests/jour-de-paris-migrations-rejeu.test.ts",
  // Lot « fuseau-suite » : rejeu de ses deux migrations et de leurs retours, `alter table … set default` sur depot_encaissements,
  // ecritures et regularisations_charges (verrou exclusif tenu pendant l'essai, qui bloquerait les écritures des autres fichiers).
  "tests/jour-de-paris-suite-migrations-rejeu.test.ts",
  // Rejoue 20261014601000 (D18, devis révisable) : `alter type` et `alter table` sur incident_devis,
  // incident_sollicitations et incident_evenements, verrou exclusif tenu pendant l'essai, qui se croise avec les fichiers
  // parallèles écrivant des devis (« deadlock detected », relecture du 15/10).
  "tests/maintenance-artisans-planifiee.test.ts",
  // D18, décisions simultanées sur deux devis du même dossier : fixture VALIDÉE (trois sessions) et verrous de ligne
  // tenus exprès sur les incidents, demandes et devis le temps de l'essai.
  "tests/devis-decisions-concurrence.test.ts",
  // Rejeu de la migration D22 (report et annulation par le locataire) : `alter table incident_evenements`, `intervention_rappels`
  // et `create trigger` sur incident_interventions dans la transaction du test, verrous tenus pendant tout l'essai.
  "tests/rendez-vous-locataire-rejeu.test.ts",
  // ART004, deux vraies transactions qui confirment un créneau : organisation, incidents et missions VALIDÉS puis supprimés
  // à chaque essai. Pendant ce temps, actualiser_orchestration() (pilotage-dossiers.test.ts) parcourt les incidents de toutes
  // les organisations et voit disparaître celle de l'essai : violation de orchestration_cases_organization_id_fkey
  // (relecture du 15/10, deux fichiers seuls en parallèle).
  "tests/planning-conflits-concurrence.test.ts",
  // Invitation d'un artisan par un propriétaire (décision du 15/10) : rejeu de 20261014840000 et de son retour arrière,
  // qui créent et suppriment une table référençant organizations, accounts et artisans (verrous tenus pendant l'essai).
  "tests/invitation-artisan-migration-rejeu.test.ts",
  // Même décision : deux acceptations simultanées, et une acceptation pendant une annulation (fixture VALIDÉE, retirée en fin).
  "tests/invitation-artisan-concurrence.test.ts",
  // X16 (relances d'invitation) : remplace `aujourdhui_paris()` dans ses essais (jour de Paris figé), rejoue la
  // migration 20261014830000 et son retour arrière (`alter table` et `create trigger` sur invitations_locataires).
  "tests/relances-invitations-locataires.test.ts",
  // X19 (SA-10), limite quotidienne des appels à l'IA : fixture VALIDÉE (vingt sessions simultanées sur la ligne du jour,
  // remise en état à la fin) et rejeu de la migration (politiques et droits reposés) dans la transaction d'un essai.
  "tests/plafond-appels-ia-base.test.ts",
  // Lot « avoir-facture-externe » (D24-C) : le retour arrière joué dans la transaction de l'essai supprime puis recrée la table
  // des avoirs et modifie artisan_factures_externes (contrainte, index, colonne) : verrou exclusif tenu pendant tout l'essai.
  "tests/artisan-avoir-migration-rejeu.test.ts",
  // D46-B (15/10), e-mail immédiat des urgences du relais : deux sessions vident la file en même temps. Fixture VALIDÉE
  // (deux comptes, un plan terminé, deux alertes) puis supprimée ; la file est globale, une ligne validée serait prise
  // par les essais d'un autre fichier.
  "tests/relais-urgences-concurrence.test.ts",
  // Même lot : une contrainte posée sur la file et le retour arrière (déclencheur retiré de supervision_alertes_internes,
  // tables supprimées puis recréées) dans la transaction du test, verrous de table tenus pendant tout l'essai.
  "tests/relais-urgences-retour.test.ts",
  // Lot mineurs du 19/10 (f, i) : rejeu de 20261019121000 et de son retour dans la transaction de l'essai (clé étrangère
  // reposée sur supervision_prospects, qui verrouille demandes_devis ; droits par colonne sur publications) : blocage
  // mutuel avec les fixtures des autres fichiers (constaté le 19/10, deux fichiers seuls).
  "tests/publications-colonnes-anon.test.ts",
  "tests/supervision-prospects-purge.test.ts",
  // Même lot, passage fréquent des urgences (relecture du 15/10) : deux passages simultanés sur deux sessions, fixture
  // VALIDÉE (un plan ACTIF : tout traiter_vacances d'un autre fichier le traiterait) puis supprimée.
  "tests/relais-urgences-passage-concurrence.test.ts",
  // Même lot : rejeu de la migration 20261014812000 et de ses migrations d'origine, retour arrière (tables supprimées,
  // fonctions réécrites, tâche pg_cron retirée) dans la transaction du test, verrous tenus pendant tout l'essai.
  "tests/relais-urgences-passage-retour.test.ts",
  // D48 (16/10), règles de conservation des registres du relais et du compteur de l'IA : rejeu de 20261014850000, de son retour et
  // de celui de 20261014231000 (réécriture d'`appliquer_retention`, règles supprimées puis reposées, `drop table` d'essai) dans la
  // transaction du fichier : verrous tenus pendant l'essai, croisés avec faits-direction-sans-noms.test.ts, qui réécrit la même fonction.
  "tests/retention-registres-relais-ia.test.ts",
  // Restitution du dépôt au jour de Paris (20261014851000) : rejeu de la migration et de son retour, fonctions supprimées puis
  // recréées (dont `aujourdhui_paris()` en cascade, qui retire les valeurs par défaut d'ecritures et de depot_encaissements).
  "tests/jour-de-paris-restitution-migration-rejeu.test.ts",
  "tests/jour-paris-complements-oct16.test.ts",
  // Identité de l'éditeur, clés des prestataires (19/10) : rejeu de 20261019123000 et de son retour (`alter table` sur
  // supervision_identite, déclencheur de traçage suspendu le temps du retour) dans la transaction du test.
  "tests/identite-prestataires-migration-rejeu.test.ts",
  // Lot « supervision et signatures » (17-18/10) : les huit retours arrière puis les huit migrations rejoués dans la transaction
  // du test (`drop function`, `drop trigger`, `drop policy`, `revoke`, `drop index`, puis `drop table … cascade` et `create table`
  // sur bail_signature_circuits, signature_budget, signature_consommations et les cinq tables de supervision) : verrous exclusifs
  // tenus pendant tout l'essai, croisés avec les fichiers parallèles qui écrivent des circuits de signature.
  "tests/retours-oct18-registre.test.ts",
  // Audit du 23/10, A03 : rejeu de 20261023161500 et de son retour (`create or replace` de charges_recuperables_exercice et
  // provisions_charges_annee) dans la transaction du fichier, tenue pendant tous ses essais ; regulariser_charges y est appelée.
  "tests/charges-agregats-portefeuille-base.test.ts",
  // Relecture adverse du 23/10 : rejeu de 20261023184512 et de son retour (`create or replace` de mes_annonces_locataire)
  // et `aujourdhui_paris()` figée au lendemain, dans la transaction du fichier tenue pendant tous ses essais.
  "tests/annonces-locataire-jour-paris-base.test.ts",
  // Plan de conformité du 24/10 (lot 1A) : rejeu de 20261024090000 et de son retour (alter table acceptations_cgu, tables
  // versions_conditions et archives_comptes supprimées puis recréées) dans la transaction du fichier.
  "tests/versions-conditions-base.test.ts",
  // Même lot (acceptation selon l'espace, R10/R19) : rejeu de 20261024100000 et de son retour (réécriture de
  // artisans_disponibles_bien, fonctions créées puis supprimées) et `artisan_note` d'essai dans la transaction du fichier.
  "tests/acceptation-conditions-base.test.ts",
  // Plan de conformité du 24/10 (lots 1B et 1C) : rejeu de 20261024110000 et de son retour (DROP/CREATE de
  // abonnements_a_relancer et abonnements_avis_reconduction_dus, contrainte des natures de retours) dans la transaction
  // du fichier, et `aujourdhui_paris()` figée le temps d'un cas.
  "tests/vente-impaye-base.test.ts",
  // Plan de conformité du 24/10 (lot 1D, décision du 23/10) : rejeu de 20261024120000 et de son retour (table
  // confirmations_mobile_caution supprimée puis recréée, déclencheur sur bail_signature_circuits) dans la transaction du fichier.
  "tests/signature-caution-edl-base.test.ts",
  // Plan de conformité du 24/10 (lot 1E) : rejeu de 20261024130000 et de son retour (tables, déclencheur sur accounts,
  // tâche pg_cron), et déclencheurs d'état suspendus (`alter table … disable trigger`) pendant chaque effacement, dans la
  // transaction du fichier.
  "tests/fermeture-comptes-base.test.ts",
  // Plan de conformité du 24/10 (lot 2, lot 1F) : rejeu de 20261024140000 et de son retour (appliquer_retention réécrite,
  // colonnes de baux et des prospects, table des oppositions) dans la transaction du fichier.
  "tests/conservation-prospection-base.test.ts",
  // Intégration des textes de la V1 (24/10) : rejeu de 20261024150000 et de son retour (create or replace de
  // comptes_inactifs_a_prevenir et fermetures_comptes_programmer_inactifs, règle compte:inactif) dans la transaction du
  // fichier.
  "tests/activation-inactivite-v1-base.test.ts",
  "tests/conservation-reglages-base.test.ts",
  // Audit de la PR #264 (27/10, LAT-01) : rejeu de 20261027100000 (déclencheur recréé sur encaissements) dans la
  // transaction du test.
  "tests/alerte-impaye-encaissement-base.test.ts",
  // Audit de la PR #264, FL-01 (27/10) : rejeu de 20261027100100 et de son retour (drop/create de
  // ouvrir_incident_agence, create or replace des fonctions locataire des incidents) dans la transaction du fichier.
  "tests/incident-gerant-colocation-base.test.ts",
  // Audit de la PR #264, ED-01 (27/10) : rejeu de 20261027100300 (déclencheur recréé sur baux) dans la transaction du test.
  "tests/assurance-locataire-activation-base.test.ts",
];

export default defineConfig({
  resolve: {
    // L'alias `@/` de tsconfig, pour que les tests importent le code applicatif
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` n'est pas un paquet installé : Next le résout lui-même à
      // la compilation (et refuse tout import côté navigateur). Sous vitest,
      // le code serveur est testé côté serveur : la version neutre de Next.
      "server-only": path.resolve(__dirname, "node_modules/next/dist/compiled/server-only/empty.js"),
    },
  },
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // `include` se pose dans chaque projet, jamais ici : un `include` de la racine s'ajouterait à celui des projets
    // et ferait rejouer toute la suite dans le groupe en série.
    projects: [
      {
        extends: true,
        test: {
          name: "parallele",
          include: ["tests/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...FICHIERS_EN_SERIE],
          sequence: { groupOrder: 1 },
        },
      },
      {
        extends: true,
        test: {
          name: "serie",
          include: FICHIERS_EN_SERIE,
          fileParallelism: false,
          sequence: { groupOrder: 2 },
        },
      },
    ],
  },
});
