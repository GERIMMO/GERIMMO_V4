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
// (chantier GitHub : .github/workflows/recette-production-autonome.yml, le seul
// qui reste ; l'ancien chantier manuel a été retiré du dépôt le 19/10/2026)
//
// Le garde-fou de la cible s'exécute ICI, au chargement : une URL qui n'est
// ni la production ni un poste local arrête tout avant le premier test.
// Playwright 1.63 ajoute un instantané DOM en cas d’échec même sans trace.
// La supervision ne doit jamais en recopier les données dans le rapport.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';
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
    // AUCUNE TRACE, AUCUNE VIDÉO, pour tous les projets : une trace Playwright
    // enregistre le réseau (en-têtes Cookie et Set-Cookie, donc les cookies de
    // session Supabase avec leurs jetons d'accès et de rafraîchissement) et
    // Playwright n'offre aucune option pour les en retirer ; le rapport HTML
    // recopie ses pièces jointes dans son dossier, et l'artefact du chantier est
    // téléchargeable sur un dépôt public. La capture d'écran d'échec (données
    // fictives, sans cookie) reste le seul élément de diagnostic déposé ; pour
    // aller plus loin, rejouer le cas sur le banc local.
    // tests/recette-config-traces.test.ts garde ces réglages.
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
  },
  // Le projet recette-connexion (@sans-trace) n'a plus qu'une raison
  // historique : ses tests tapent le mot de passe (outils.ts, SANS_TRACE) et il
  // coupe la trace une seconde fois, en défense en profondeur, maintenant
  // qu'elle est coupée pour tous. L'ordre des projets est sans conséquence :
  // la session d'un parcours s'ouvre dans son propre processus, et une
  // déconnexion ne révoque que les sessions déjà ouvertes.
  //
  // Le projet recette-montants, lui, dépend de l'ordre : les contrôles des montants (@montants, montants-p1.spec.ts) activent un
  // bail dans le parc du propriétaire, ce qui referme son parcours de démarrage, qu'un test de proprietaire.spec.ts vérifie.
  // Avec un seul processus, les projets passent dans l'ordre où ils sont déclarés : il est donc déclaré en dernier, sans
  // dépendance (un échec ailleurs ne doit pas le faire sauter).
  projects: [
    { name: "recette-mobile", grepInvert: /@sans-trace|@montants|@supervision|@parcours-metier/ },
    { name: "recette-connexion", grep: /@sans-trace/, use: { trace: "off" } },
    { name: "recette-montants", grep: /@montants/ },
    // La supervision lit des données réelles : ni cookies AAL2, ni contenu client
    // en artefact. Connexion et MFA sont préparés hors du test runner.
    { name: "recette-supervision", grep: /@supervision/, use: { trace: "off", screenshot: "off", video: "off" } },
    { name: "recette-parcours-metier", grep: /@parcours-metier/, use: { trace: "off", screenshot: "off", video: "off" } },
  ],
});
