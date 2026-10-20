import { defineConfig } from "@playwright/test";
import commun from "./playwright.config";

// Complément Safari/WebKit sur données fictives. Le moteur ne remplace pas
// une recette sur iPhone physique (clavier, appareil photo et intégrations OS).
for (const adresse of [
  process.env.E2E_BASE_URL ?? "http://localhost:3000",
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
]) {
  const url = new URL(adresse);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Les essais WebKit exigent le site et l’API fictifs locaux.");
  }
}

export default defineConfig({
  ...commun,
  outputDir: "./.results-webkit",
  workers: 1,
  use: {
    ...commun.use,
    browserName: "webkit",
    launchOptions: {},
  },
  projects: [
    { name: "setup-webkit", testMatch: /auth\.setup\.ts/ },
    {
      name: "mobile-webkit",
      dependencies: ["setup-webkit"],
      testMatch: /(?:dossier-proprietaire|parcours-locataire|parcours-artisan|depot-direct|bouton-envoi-hydratation|protection-saisie|repli-hors-ligne|vitrine)\.spec\.ts/,
    },
  ],
});
