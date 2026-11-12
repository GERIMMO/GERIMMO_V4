import { defineConfig } from "@playwright/test";
import commun from "./playwright.config";

const parcours = /(?:depot-bail-signe-papier|detention-confirmation|attestations-refus|abonnement)\.spec\.ts$/;
export default defineConfig({
  ...commun,
  workers: 1,
  retries: 0,
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "telephone", dependencies: ["setup"], testMatch: parcours },
    { name: "ordinateur", dependencies: ["setup"], testMatch: parcours,
      use: { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 } },
  ],
});
