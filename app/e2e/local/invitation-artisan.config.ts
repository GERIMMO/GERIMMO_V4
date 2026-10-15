import { defineConfig } from "@playwright/test";

// Parcours de l'invitation d'un artisan par un propriétaire (décision du 15/10/2026), sur le banc local : émulateur
// Supabase sur une base API fictive (SUPALOCAL_DB), application construite et servie à E2E_BASE_URL. Aucun envoi réel
// d'e-mail : sans RESEND_API_KEY, l'écran dit « n'a pas été envoyé ».
export default defineConfig({
  testDir: "..",
  testMatch: "invitation-artisan.spec.ts",
  outputDir: "../.results-invitation-artisan",
  timeout: 300_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3106",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
  },
  projects: [{ name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } }],
});
