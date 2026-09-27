import {
  debordementHorizontal,
  espaceDe,
  expect,
  jugerEcran,
  liensDuMenu,
  oublierSession,
  retenirSession,
  selecteurMenu,
  seConnecter,
  SANS_TRACE,
  seDeconnecterParLeMenu,
  test,
} from "./outils";

// RECETTE — LE LOCATAIRE.
//
// Le compte vient de preparer-comptes.sql : fiche et adhésion dans l'agence
// de recette, SANS bail. C'est le cas du locataire invité avant la signature :
// son espace doit s'ouvrir sur un état vide lisible, jamais sur une erreur.

test.describe("locataire", () => {
  test("se connecte et son espace s'ouvre, lisible sans bail", SANS_TRACE, async ({ page, context, surveillance }) => {
    await seConnecter(page, "locataire");
    await page.goto("/espaces");
    await page.waitForURL(new RegExp(`${espaceDe("locataire")}(/|\\?|$)`), { timeout: 30_000 });
    const defauts = await jugerEcran(page, espaceDe("locataire"), surveillance);
    expect(defauts, "Accueil du locataire en défaut").toEqual([]);
    await expect(page.getByRole("heading", { level: 1, name: /Bonjour/ })).toBeVisible();
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(0);
    await retenirSession("locataire", context);
  });

  test.describe("avec sa session", () => {
    test.use({ persona: "locataire" });

    test("chaque écran du menu de son espace s'ouvre, titré et sans erreur", async ({ page, surveillance }) => {
      await page.goto(espaceDe("locataire"));
      const liens = await liensDuMenu(page, selecteurMenu("locataire"));
      expect(liens.length, "le menu de l'espace porte des entrées").toBeGreaterThan(4);
      test.info().annotations.push({ type: "écrans parcourus", description: liens.join(" · ") });
      test.setTimeout(60_000 + liens.length * 45_000);
      const defauts: string[] = [];
      for (const lien of liens) {
        defauts.push(...(await jugerEcran(page, lien, surveillance)));
      }
      expect(defauts, "Écrans du menu en défaut").toEqual([]);
    });
  });

  test("se déconnecte depuis le menu du compte", SANS_TRACE, async ({ page }) => {
    await seConnecter(page, "locataire");
    await page.goto(espaceDe("locataire"));
    await seDeconnecterParLeMenu(page);
    oublierSession("locataire");
  });
});
