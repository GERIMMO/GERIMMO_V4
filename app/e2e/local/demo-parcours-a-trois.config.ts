import { defineConfig } from "@playwright/test";
import { baseApiFictive } from "./base-api-fictive";

baseApiFictive(process.env.SUPALOCAL_DB);
if (new URL(process.env.SUPALOCAL_DB).pathname !== "/gerimmo_ci_demo_vente_api") {
  throw new Error("Base locale dédiée gerimmo_ci_demo_vente_api requise.");
}
const site = new URL(process.env.E2E_BASE_URL ?? "");
for (const url of [site, new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")]) {
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error("Site et API de démonstration sur boucle locale requis.");
  }
}

export default defineConfig({
  testDir: "..",
  outputDir: "../.results/demo-parcours-a-trois",
  workers: 1,
  retries: 0,
  timeout: 480_000,
  expect: { timeout: 25_000 },
  use: {
    baseURL: site.origin, locale: "fr-FR", timezoneId: "Europe/Paris",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
  },
  projects: [
    { name: "sessions", testMatch: "auth.setup.ts" },
    ...[390, 1440].map(width => ({
      name: String(width),
      testMatch: "demo-parcours-a-trois.presentation.ts",
      dependencies: ["sessions"],
      use: { viewport: { width, height: width === 390 ? 844 : 1000 }, deviceScaleFactor: width === 390 ? 2 : 1 },
    })),
  ],
});
