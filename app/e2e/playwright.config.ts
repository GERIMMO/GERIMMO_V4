import { defineConfig } from "@playwright/test";

// Suite E2E mobile : tout tourne au gabarit téléphone (390×844, tactile).
// Le serveur visé est le dev local (npm run dev) ; les comptes sont ceux du
// seed de démo (app/supabase/seed.sql).
export default defineConfig({
  testDir: ".",
  outputDir: "./.results",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  retries: 1,
  reporter: [["list"]],
  use: {
    // Environnements à Chromium pré-installé (Claude Code web) : pointer
    // PLAYWRIGHT_CHROMIUM sur le binaire ; sur un poste normal, laisser vide.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM }
      : {},
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "mobile",
      testMatch: /.*\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/connexion",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
