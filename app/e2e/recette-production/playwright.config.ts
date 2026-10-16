import { defineConfig } from "@playwright/test";
import path from "node:path";
import { verifierCible } from "./cible";

// RECETTE DE PRODUCTION — la suite qui parcourt le site EN LIGNE avec de vrais
// comptes, au gabarit téléphone, comme la suite E2E du banc.
//
// Elle ne dépend d'AUCUN outil du banc (pas d'émulateur, pas de /__banc, pas
// de mfa-local, pas de seed) : les comptes viennent des variables
// d'environnement (voir cible.ts), préparés par preparer-comptes.sql et
// purgés après le passage par purger.sql.
//
// Lancement :
//   RECETTE_URL=https://www.gerimmo.app RECETTE_MOT_DE_PASSE=… RECETTE_EMAIL_ADMIN=… \
//   npx playwright test --config e2e/recette-production/playwright.config.ts
// (workflow GitHub : .github/workflows/recette-production.yml)
//
// Le garde-fou de la cible s'exécute ICI, au chargement : une URL qui n'est
// ni la production ni un poste local arrête tout avant le premier test.
const baseURL = verifierCible(process.env.RECETTE_URL);
const RESULTATS = path.join(__dirname, ".resultats");

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts/,
  outputDir: path.join(RESULTATS, "essais"),
  // La production répond vite ; le serveur de dév compile chaque écran à sa
  // première visite — d'où des marges larges.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(RESULTATS, "rapport"), open: "never" }],
  ],
  use: {
    // Environnements à Chromium pré-installé (Claude Code web) : pointer
    // PLAYWRIGHT_CHROMIUM sur le binaire ; ailleurs, laisser vide.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
      : {},
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  // Deux projets pour une seule raison : la trace. Les tests étiquetés
  // @sans-trace tapent le mot de passe (outils.ts, SANS_TRACE) ; leur trace
  // l'enregistrerait en clair dans l'artefact. L'ordre des projets est sans
  // conséquence : la session d'un parcours s'ouvre dans son propre processus,
  // et une déconnexion ne révoque que les sessions déjà ouvertes.
  //
  // Le troisième projet, lui, dépend de l'ordre : les contrôles des montants (@montants, montants-p1.spec.ts) activent un
  // bail dans le parc du propriétaire, ce qui referme son parcours de démarrage, qu'un test de proprietaire.spec.ts vérifie.
  // Avec un seul processus, les projets passent dans l'ordre où ils sont déclarés : il est donc déclaré en dernier, sans
  // dépendance (un échec ailleurs ne doit pas le faire sauter).
  projects: [
    { name: "recette-mobile", grepInvert: /@sans-trace|@montants/ },
    { name: "recette-connexion", grep: /@sans-trace/, use: { trace: "off" } },
    { name: "recette-montants", grep: /@montants/ },
  ],
});
