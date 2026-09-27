import { lireComptes } from "./cible";
import {
  cliquer,
  creerBien,
  debordementHorizontal,
  espaceDe,
  expect,
  jugerEcran,
  liensDuMenu,
  nomUnique,
  oublierSession,
  retenirSession,
  saisir,
  selecteurMenu,
  seConnecter,
  SANS_TRACE,
  seDeconnecterParLeMenu,
  test,
} from "./outils";

// RECETTE — L'ADMIN D'AGENCE.
//
// Le compte vient de preparer-comptes.sql : une agence en essai, vide. Les
// tests créent un bien, son lot et une fiche locataire nommés d'après le
// suffixe du passage ; purger.sql les retire avec l'agence.

test.describe("admin d'agence", () => {
  test("se connecte par le formulaire et arrive sur l'espace de son agence", SANS_TRACE, async ({ page, context }) => {
    await seConnecter(page, "admin");
    await page.goto("/espaces");
    await page.waitForURL(new RegExp(`${espaceDe("admin")}(/|\\?|$)`), { timeout: 30_000 });
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Mon compte/ })).toBeVisible();
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);
    await retenirSession("admin", context);
  });

  test.describe("avec sa session", () => {
    test.use({ persona: "admin" });

    test("chaque écran du menu de l'espace s'ouvre, titré et sans erreur", async ({ page, surveillance }) => {
      await page.goto(espaceDe("admin"));
      const liens = await liensDuMenu(page, selecteurMenu("admin"));
      expect(liens.length, "le menu de l'espace porte des entrées").toBeGreaterThan(5);
      test.info().annotations.push({ type: "écrans parcourus", description: liens.join(" · ") });
      test.setTimeout(60_000 + liens.length * 45_000);
      const defauts: string[] = [];
      for (const lien of liens) {
        defauts.push(...(await jugerEcran(page, lien, surveillance)));
      }
      expect(defauts, "Écrans du menu en défaut").toEqual([]);
    });

    test("crée un bien et son premier lot, et le retrouve au parc", async ({ page }) => {
      const { orgAgence } = lireComptes();
      const nom = await creerBien(page, orgAgence, nomUnique("Bien recette"));
      await page.goto(`/agence/${orgAgence}/parc`);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect(page.locator("body")).toContainText(nom);
    });

    test("crée la fiche d'un locataire à une adresse resend.dev", async ({ page }) => {
      const { orgAgence, suffixe } = lireComptes();
      const email = `delivered+locataire-${suffixe}@resend.dev`;
      await page.goto(`/agence/${orgAgence}/personnes`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // Une seule fiche par adresse dans l'agence : au second essai d'un test
      // en échec, la fiche du premier existe déjà — on la retrouve.
      if (test.info().retry > 0 && (await page.getByText(email).count()) > 0) {
        test.info().annotations.push({ type: "reprise", description: "fiche déjà créée au premier essai" });
        return;
      }
      const carte = page.locator("#creer-fiche");
      await carte.scrollIntoViewIfNeeded();
      const role = carte.getByRole("button", { name: /^Locataire/ });
      const nom = page.locator("#p-nom");
      // Le choix du rôle avance tout seul ; un clic parti avant l'hydratation
      // ne fait rien : on insiste jusqu'à voir l'étape « Identité ».
      await expect(async () => {
        if (!(await nom.isVisible())) await cliquer(role);
        await expect(nom).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 30_000 });
      await saisir(nom, `Recette-${suffixe}`);
      await saisir(page.locator("#p-prenom"), "Léa");
      await saisir(page.locator("#p-email"), email);
      await saisir(page.locator("#p-naissance"), "1990-05-14");
      await saisir(page.locator("#p-commune-naissance"), "Lyon");
      await saisir(page.locator("#p-adresse"), "3 place de la Recette");
      await saisir(page.locator("#p-cp"), "69002");
      await saisir(page.locator("#p-ville"), "Lyon");
      await cliquer(page.getByRole("button", { name: "Créer la fiche" }));
      // La création mène à la fiche de la personne.
      await page.waitForURL(new RegExp(`/agence/${orgAgence}/personnes/[0-9a-f-]{36}`), { timeout: 30_000 });
      await expect(page.locator("body")).toContainText(`Recette-${suffixe}`);
      await page.goto(`/agence/${orgAgence}/personnes`);
      await expect(page.locator("body")).toContainText(email);
    });

    test("la page Loyers & charges s'affiche", async ({ page, surveillance }) => {
      const chemin = `${espaceDe("admin")}/loyers`;
      expect(await jugerEcran(page, chemin, surveillance)).toEqual([]);
      await expect(page.getByRole("heading", { level: 1, name: /Loyers & charges/ })).toBeVisible();
      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);
    });

    test("la page Alertes s'affiche", async ({ page, surveillance }) => {
      const chemin = `${espaceDe("admin")}/alertes`;
      expect(await jugerEcran(page, chemin, surveillance)).toEqual([]);
      await expect(page.getByRole("heading", { level: 1, name: "Alertes" })).toBeVisible();
      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);
    });

    test("une adresse inconnue affiche « Cette page est introuvable »", async ({ page }) => {
      const reponse = await page.goto(`/recette-adresse-inconnue-${Date.now()}`);
      expect(reponse?.status()).toBe(404);
      await expect(page.getByRole("heading", { level: 1, name: "Cette page est introuvable" })).toBeVisible();
      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);
    });

    test("la page Profil de l'agence s'affiche", async ({ page, surveillance }) => {
      const chemin = `${espaceDe("admin")}/profil`;
      expect(await jugerEcran(page, chemin, surveillance)).toEqual([]);
      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);
    });
  });

  // En dernier : la déconnexion révoque TOUTES les sessions du compte.
  test("se déconnecte depuis le menu du compte", SANS_TRACE, async ({ page }) => {
    await seConnecter(page, "admin");
    await page.goto(espaceDe("admin"));
    await seDeconnecterParLeMenu(page);
    oublierSession("admin");
  });
});
