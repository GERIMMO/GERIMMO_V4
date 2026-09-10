import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Ouvre une session par persona via le formulaire de connexion (le vrai flux)
// et enregistre l'état de session pour les specs. Comptes du seed de démo.
const COMPTES = [
  { nom: "agent", email: "agent.alpha@gerimmo-demo.fr" },
  { nom: "admin", email: "admin.alpha@gerimmo-demo.fr" },
  { nom: "locataire", email: "locataire.alpha@gerimmo-demo.fr" },
  { nom: "proprietaire", email: "proprietaire@gerimmo-demo.fr" },
  { nom: "superadmin", email: "superadmin@gerimmo-demo.fr" },
];

const MOT_DE_PASSE = process.env.E2E_MOT_DE_PASSE ?? "Gerimmo-Demo-2026";
const DOSSIER = path.join(__dirname, ".auth");

setup("sessions des personas", async ({ browser }) => {
  fs.mkdirSync(DOSSIER, { recursive: true });
  for (const compte of COMPTES) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/connexion");
    await page.locator("#email").fill(compte.email);
    await page.locator("#mot-de-passe").fill(MOT_DE_PASSE);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL(/\/(espaces|agence|locataire|proprietaire|admin)/, {
      timeout: 20_000,
    });
    await expect(page.locator("body")).not.toContainText("Identifiants invalides");
    await context.storageState({ path: path.join(DOSSIER, `${compte.nom}.json`) });
    await context.close();
  }
});
