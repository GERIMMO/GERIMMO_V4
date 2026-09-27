import { lireComptes } from "./cible";
import {
  creerBien,
  debordementHorizontal,
  espaceDe,
  expect,
  jugerEcran,
  liensDuMenu,
  nomUnique,
  oublierSession,
  retenirSession,
  selecteurMenu,
  seConnecter,
  SANS_TRACE,
  seDeconnecterParLeMenu,
  test,
} from "./outils";

// RECETTE — LE PROPRIÉTAIRE DIRECT.
//
// Le compte vient de preparer-comptes.sql avec UN bien : le premier est
// offert à vie, et « Mon abonnement » n'affiche alors aucun bouton. C'est le
// second bien, créé ici, qui fait apparaître un montant et le bouton
// « S'abonner » — que la recette regarde et ne touche JAMAIS (aucun paiement).

test.describe("propriétaire direct", () => {
  test("se connecte et voit le parcours de démarrage", SANS_TRACE, async ({ page, context }) => {
    await seConnecter(page, "proprietaire");
    await page.goto("/espaces");
    await page.waitForURL(new RegExp(`${espaceDe("proprietaire")}(/|\\?|$)`), { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: /Bonjour/ })).toBeVisible();
    // Le chemin du démarrage : présent tant qu'aucun bail n'est actif.
    await expect(page.getByRole("region", { name: /Mettre votre premier (lot|bien) en location/ })).toBeVisible();
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);
    await retenirSession("proprietaire", context);
  });

  test.describe("avec sa session", () => {
    test.use({ persona: "proprietaire" });

    test("chaque écran du menu de son espace s'ouvre, titré et sans erreur", async ({ page, surveillance }) => {
      await page.goto(espaceDe("proprietaire"));
      const liens = await liensDuMenu(page, selecteurMenu("proprietaire"));
      expect(liens.length, "le menu de l'espace porte des entrées").toBeGreaterThan(5);
      test.info().annotations.push({ type: "écrans parcourus", description: liens.join(" · ") });
      test.setTimeout(60_000 + liens.length * 45_000);
      const defauts: string[] = [];
      for (const lien of liens) {
        defauts.push(...(await jugerEcran(page, lien, surveillance)));
      }
      expect(defauts, "Écrans du menu en défaut").toEqual([]);
    });

    test("crée un bien et le retrouve dans ses lots", async ({ page }) => {
      const { orgProprietaire } = lireComptes();
      const nom = await creerBien(page, orgProprietaire, nomUnique("Appartement recette"));
      await page.goto(`/agence/${orgProprietaire}/parc`);
      await expect(page.locator("body")).toContainText(nom);
    });

    test("« Mon abonnement » affiche un montant et le bouton d'abonnement, sans le toucher", async ({ page, surveillance }) => {
      const { orgProprietaire } = lireComptes();
      const chemin = `/agence/${orgProprietaire}/abonnement`;
      expect(await jugerEcran(page, chemin, surveillance)).toEqual([]);
      // Test autonome : s'il n'y a qu'un bien (test précédent non joué), le
      // bouton n'a pas lieu d'être — on crée le second, comme un client.
      if (await page.getByText(/Rien à régler pour l.instant/).isVisible()) {
        await creerBien(page, orgProprietaire, nomUnique("Second bien recette"));
        await page.goto(chemin);
      }
      await expect(page.getByText("Total mensuel")).toBeVisible();
      await expect(page.locator(".montant").filter({ hasText: /\d.*€/ }).first()).toBeVisible();
      const bouton = page.getByRole("button", { name: /S[’']abonner/ });
      await expect(bouton).toBeVisible();
      await expect(bouton).toContainText(/€/);
      // Aucun clic : le bouton part vers le paiement Stripe.
      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);
    });
  });

  test("se déconnecte depuis le menu du compte", SANS_TRACE, async ({ page }) => {
    await seConnecter(page, "proprietaire");
    await page.goto(espaceDe("proprietaire"));
    await seDeconnecterParLeMenu(page);
    oublierSession("proprietaire");
  });
});
