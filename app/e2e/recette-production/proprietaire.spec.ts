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

const MOTIF_PILOTE = "Les nouvelles souscriptions payantes sont fermées pendant le pilote gratuit.";

test.describe("propriétaire direct", () => {
  test("se connecte et voit le parcours de démarrage", SANS_TRACE, async ({ page, context }) => {
    await seConnecter(page, "proprietaire");
    await page.goto("/espaces");
    await page.waitForURL(new RegExp(`${espaceDe("proprietaire")}(/|\\?|$)`), { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: /Bonjour/ })).toBeVisible();
    // Dès le premier bien créé, les étapes restent accessibles dans le volet dédié.
    const etapes = page.locator('summary').filter({ hasText: 'Les étapes de ma première location' });
    if (await etapes.count()) await etapes.click();
    await expect(page.getByRole("region", { name: /Commençons votre première location|Terminer votre première location|Mettre votre premier (lot|bien) en location/ })).toBeVisible();
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
      const nom = await creerBien(page, espaceDe("proprietaire"), nomUnique("Appartement recette"));
      await page.goto(`${espaceDe("proprietaire")}/parc`);
      await expect(page.locator("body")).toContainText(nom);
    });

    // Décision D27 : un ancien lien /agence/<id>/… (reçu par e-mail, mis en favori) mène à la même page sous
    // /espace/<id>/…, chemin et requête conservés, par une redirection permanente que le navigateur revalide.
    test("un ancien lien /agence/<id>/… est redirigé à vie vers /espace/<id>/…", async ({ page }) => {
      const { orgProprietaire } = lireComptes();
      const reponse = await page.request.get(`/agence/${orgProprietaire}/parc?vue=recette`, { maxRedirects: 0 });
      expect(reponse.status()).toBe(308);
      const lieu = new URL(reponse.headers()["location"], "http://adresse.invalide");
      expect(lieu.pathname + lieu.search).toBe(`/espace/${orgProprietaire}/parc?vue=recette`);
      expect(reponse.headers()["cache-control"]).toBe("private, no-cache");
      await page.goto(`/agence/${orgProprietaire}/parc`);
      await expect(page).toHaveURL(new RegExp(`/espace/${orgProprietaire}/parc$`));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });

    test("« Mon abonnement » affiche le récapitulatif avant paiement et dit si le paiement est ouvert, sans le toucher", async ({ page, surveillance }) => {
      const chemin = `${espaceDe("proprietaire")}/abonnement`;
      expect(await jugerEcran(page, chemin, surveillance)).toEqual([]);
      // Fermé : tarifs informatifs, sans fausse commande. Ouvert : vrai récapitulatif.
      const recap = page.getByRole("region", { name: "Récapitulatif avant paiement", exact: true });
      const tarifs = page.locator(".loc-carte").filter({ has: page.getByRole("heading", { name: "Tarifs à titre d’information" }) });
      const bouton = page.getByRole("button", { name: /Continuer vers le paiement sécurisé/ });
      const pilote = page.getByText(MOTIF_PILOTE, { exact: true });
      // Selon la configuration, la fermeture est expliquée par le pilote,
      // l'absence du paiement en ligne ou les prérequis contractuels.
      const indisponible = page.getByText(/^Le paiement en ligne n'est pas encore ouvert/);
      if (process.env.RECETTE_SOUSCRIPTIONS_FERMEES === "1") {
        await expect(pilote.or(indisponible)).toBeVisible();
        await expect(tarifs).toBeVisible();
        await expect(tarifs).toContainText(/Mensuel/);
        await expect(tarifs).toContainText(/Annuel/);
        await expect(tarifs).toContainText(/\d.*€/);
        await expect(recap).toHaveCount(0);
        await expect(bouton).toHaveCount(0);
      } else if (await bouton.count()) {
        await expect(bouton).toBeVisible();
        await expect(recap).toContainText("Total à payer");
        await expect(recap).toContainText(/\d.*€/);
        await expect(pilote.or(indisponible)).toHaveCount(0);
      } else {
        await expect(pilote.or(indisponible)).toBeVisible();
      }
      // Aucun clic, dans aucun des deux états : le bouton part vers le paiement Stripe.
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
