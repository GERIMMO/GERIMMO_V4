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
// Grille du 28/09 : « Mon abonnement » affiche un récapitulatif avant paiement
// et le bouton « Continuer vers le paiement sécurisé » — que la recette regarde
// et ne touche JAMAIS (aucun paiement). Lot B3 (19/10) : le bouton n'apparaît
// que si l'identité de l'éditeur est renseignée (supervision_identite, écran
// /admin/parametres, hors dépôt) ; sinon l'écran dit pourquoi, par la phrase
// MOTIF_IDENTITE ci-dessous (= lib/garde-souscription.ts).

/** Le motif exact affiché tant que les mentions légales de l'éditeur manquent (lib/garde-souscription.ts). */
const MOTIF_IDENTITE =
  "Le paiement en ligne n’est pas encore ouvert : les mentions légales de l’éditeur sont en cours de publication. Votre essai continue.";

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
      // Grille du 28/09 : le récapitulatif avant paiement remplace l'ancien
      // « Total mensuel » (sans offre à vie ni second bien à créer). Il reste
      // affiché que le paiement soit ouvert ou non.
      const recap = page.getByRole("region", { name: "Récapitulatif avant paiement", exact: true });
      await expect(recap).toBeVisible();
      await expect(recap).toContainText("Total à payer TTC");
      await expect(recap).toContainText(/\d.*€/);
      // Lot B3 (19/10) : DEUX ÉTATS, et exactement un des deux est prouvé.
      // L'identité de l'éditeur se renseigne hors dépôt (/admin/parametres) et
      // fait basculer l'écran sans déploiement : tant qu'elle est incomplète
      // (c'est le cas en production le 19/10), le bouton est absent et le motif
      // exact est affiché ; une fois renseignée, le bouton est visible et le
      // motif a disparu. L'état constaté est consigné dans le rapport.
      const bouton = page.getByRole("button", { name: /Continuer vers le paiement sécurisé/ });
      const motif = page.locator("main").getByText(MOTIF_IDENTITE, { exact: true });
      const ouvert = (await bouton.count()) > 0;
      if (ouvert) {
        await expect(bouton).toBeVisible();
        await expect(motif).toHaveCount(0);
      } else {
        await expect(motif).toBeVisible();
        await expect(bouton).toHaveCount(0);
      }
      test.info().annotations.push({
        type: "paiement en ligne",
        description: ouvert
          ? "ouvert : identité de l'éditeur renseignée, bouton visible (non cliqué)"
          : "fermé : identité de l'éditeur à renseigner dans /admin/parametres, motif affiché",
      });
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
