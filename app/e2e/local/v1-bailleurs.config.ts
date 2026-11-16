// Recette locale des quatre portails sur les mêmes écrans qu’en production.
import { defineConfig } from "@playwright/test";
import { baseApiFictive } from "./base-api-fictive";
baseApiFictive(process.env.SUPALOCAL_DB);
const site = new URL(process.env.E2E_BASE_URL ?? "");
const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
for (const url of [site, api]) {
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Cette recette exige un site et une API fictifs sur la boucle locale.");
  }
}
const profils = [
  ...(new URL(process.env.SUPALOCAL_DB!).pathname === "/gerimmo_ci_demo_vente_api" ? ["local/agenda.presentation.ts"] : []),
  "premiere-location-continue.spec.ts", "lot2-pilote.spec.ts", "depot-bail-signe-papier.spec.ts", "creation-bien-reprise.spec.ts", "dossier-proprietaire.spec.ts", "lot3-loyer-facture.spec.ts", "parcours-locataire.spec.ts",
  "parcours-artisan.spec.ts", "compte-supervision.spec.ts", "incidents-reprise.spec.ts",
  "artisan-fin-mission.spec.ts", "devis-reprise.spec.ts", "comptabilite-vues.spec.ts",
  "reception-loyer-proprietaire.spec.ts", "incident-gerant-colocation.spec.ts", "fiscalite-qualifiee.spec.ts",
  "contre-audit-proprietaire.spec.ts", "supervision-consignes.spec.ts", "support-bailleur.spec.ts",
];
export default defineConfig({
  testDir: "..", testIgnore: ["**/recette-production/**"], workers: 1, retries: 0,
  outputDir: "../.results/v1-bailleurs", timeout: 180_000, expect: { timeout: 25_000 },
  use: { baseURL: site.origin, locale: "fr-FR", timezoneId: "Europe/Paris",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {} },
  projects: [
    { name: "sessions", testMatch: "auth.setup.ts" },
    { name: "ordinateur", testMatch: profils, dependencies: ["sessions"], use: {viewport:{width:1440,height:1000}} },
    { name: "telephone", testMatch: profils, dependencies: ["sessions"], use: {viewport:{width:390,height:844},isMobile:true,hasTouch:true} },
  ],
});
