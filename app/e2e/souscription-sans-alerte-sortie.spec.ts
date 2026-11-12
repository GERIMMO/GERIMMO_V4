import { test, expect } from "@playwright/test";
import path from "node:path";
import { sansSyntheseAlertes } from "./aides";

/**
 * G-25 (recette du 11/11/2026) : choisir « Annuel » puis « Continuer vers le paiement sécurisé » ouvrait
 * « Quitter le site ? » au moment où le serveur redirigeait vers la page de paiement ; « Rester » bloquait tout.
 * Le départ vers le paiement est ici reproduit par une navigation hors de la page (la redirection réelle exige
 * Stripe). La protection des autres formulaires de saisie reste couverte par protection-saisie.spec.ts.
 */
const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
test.use({ storageState: path.join(__dirname, ".auth", "proprietaire.json") });

for (const periode of ["Mensuel", "Annuel"]) {
  test(`G-25 : souscription ${periode.toLowerCase()} — aucun « Quitter le site ? » en partant vers le paiement`, async ({ page }) => {
    const dialogues: string[] = [];
    page.on("dialog", async d => { dialogues.push(d.type()); await d.dismiss(); });
    await page.goto(`/espace/${ORG}/abonnement`);
    await sansSyntheseAlertes(page);
    const bouton = page.getByRole("button", { name: /Continuer vers le paiement sécurisé/ });
    test.skip(!(await bouton.isVisible().catch(() => false)), "Le compte de démonstration n'affiche pas la souscription.");
    // Bascule réelle de la périodicité (geste utilisateur), aller-retour pour « Mensuel ».
    await page.getByLabel(/Annuel/).first().check();
    if (periode === "Mensuel") await page.getByLabel(/Mensuel/).first().check();
    await page.evaluate(() => { window.location.assign("/connexion"); });
    await page.waitForURL(/\/connexion|\/espaces?/, { timeout: 15_000 });
    expect(dialogues).toEqual([]);
  });
}
