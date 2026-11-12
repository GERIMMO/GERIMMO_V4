import { test, expect } from "@playwright/test";
import path from "node:path";
import { sansSyntheseAlertes } from "./aides";

/**
 * G-25 (recette du 11/11/2026) : choisir « Annuel » puis « Continuer vers le paiement sécurisé » ouvrait
 * « Quitter le site ? » au moment où le serveur redirigeait vers la page de paiement ; « Rester » bloquait tout.
 * Le parcours réel exige un paiement configuré : sur un banc sans Stripe, le bouton n'est pas proposé et le test est
 * sauté. Banc de preuve : GERIMMO_MODE=simulation, NODE_ENV=test, clé factice sk_test_… et SDK Stripe détourné vers
 * un simulateur local (aucun appel à Stripe). La protection des autres formulaires reste couverte par
 * protection-saisie.spec.ts.
 */
const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
test.use({ storageState: path.join(__dirname, ".auth", "proprietaire.json") });

for (const periode of ["Mensuel", "Annuel"]) {
  test(`G-25 : souscription ${periode.toLowerCase()} — aucun « Quitter le site ? » en partant vers le paiement`, async ({ page }) => {
    const dialogues: string[] = [];
    page.on("dialog", async d => { dialogues.push(d.type()); await d.dismiss(); });
    await sansSyntheseAlertes(page);
    await page.goto(`/espace/${ORG}/abonnement`);
    const bouton = page.getByRole("button", { name: /Continuer vers le paiement sécurisé/ });
    const proposee = await bouton.waitFor({ state: "visible", timeout: 15_000 }).then(() => true, () => false);
    test.skip(!proposee, "Paiement non configuré sur ce banc : souscription non proposée.");
    // Comme un vrai client : la version en vigueur des conditions s'accepte d'abord (enregistrée sur la base du banc).
    const conditions = page.getByRole("checkbox", { name: /J’ai lu et j’accepte la version du/ });
    if (await conditions.isVisible().catch(() => false)) {
      await conditions.check();
      await expect(page.getByText(/des conditions générales est enregistrée/)).toBeVisible({ timeout: 20_000 });
    }
    if (periode === "Annuel") {
      // La carte « Annuel » (libellé visible) porte le bouton radio natif, masqué : on clique comme l'utilisateur.
      await page.locator("label", { hasText: "2 mois offerts" }).first().click();
      await expect(page.getByRole("radio", { name: /^Annuel/ })).toBeChecked();
    }
    // La case de confirmation et la périodicité modifient le formulaire : c'est ce qui déclenchait l'avertissement.
    await page.getByLabel(/J'ai vérifié le montant de/).check();
    await expect(page.getByText(new RegExp(`J'ai vérifié le montant de .* ${periode === "Annuel" ? "par an" : "par mois"}`))).toBeVisible();
    await page.route(/^https:\/\/[^/]+\//, route => route.fulfill({ contentType: "text/html", body: "<h1>Paiement simulé</h1>" }));
    const depart = page.waitForRequest(r => r.isNavigationRequest() && !new URL(r.url()).hostname.match(/^(localhost|127\.0\.0\.1)$/), { timeout: 20_000 });
    await bouton.click();
    const requete = await depart;
    expect(new URL(requete.url()).protocol).toBe("https:");
    expect(dialogues).toEqual([]);
  });
}
