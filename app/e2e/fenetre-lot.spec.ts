import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// LA FENÊTRE DU LOT — au gabarit téléphone, pour les deux qui l'ouvrent.
//
// CE QUE CES TESTS PROTÈGENT.
//
// 1. **Le clic ouvre la fenêtre, et vite.** C'est toute la demande du 12/09 :
//    « lorsqu'il clique sur le lot, ça ouvre une fenêtre sur la page ». Une
//    navigation vers une autre page passerait le test de « on voit le lot » et
//    raterait la demande.
//
// 2. **Les volets ne chargent qu'au déroulé.** Sur un portefeuille de trois
//    cents lots, tout ramener d'un coup se paierait trois cents fois par jour.
//    On vérifie donc qu'AVANT le clic, le contenu n'est pas là.
//
// 3. **La portée.** Le locataire ouvre la MÊME fenêtre et n'y voit ni le
//    propriétaire, ni les honoraires de l'agence. Ce test-là est le seul qui
//    regarde le produit du point de vue de celui qui le subirait.

const ORG = "c14c3187-1258-4e58-8822-368c6007e3fa";

test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
});

/** La boîte de dialogue de la fenêtre, une fois ouverte. */
function fenetre(page: Page) {
  return page.getByRole("dialog");
}

test.describe("Côté agence", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "agent.json") });

  test("cliquer un lot ouvre la fenêtre — sans quitter le Parc", async ({ page }) => {
    await page.goto(`/agence/${ORG}/parc`);
    const urlAvant = page.url();
    await page.getByRole("button", { name: /E2E Lot 1/ }).first().click();

    const f = fenetre(page);
    await expect(f).toBeVisible();
    // Le locataire et le propriétaire, tout de suite, sans rien déplier.
    // `first()` : le mandant est nommé deux fois — comme détenteur (avec sa
    // quote-part) et comme mandant. C'est voulu : les deux rôles peuvent être
    // tenus par des personnes différentes, et l'agent doit voir les deux.
    await expect(f.getByText("E2E Locataire")).toBeVisible();
    await expect(f.getByText(/E2E Mandant/).first()).toBeVisible();
    // On n'a pas changé de page : c'est une fenêtre, pas une navigation.
    expect(page.url()).toBe(urlAvant);
  });

  test("les deux volets ne chargent qu'au déroulé", async ({ page }) => {
    await page.goto(`/agence/${ORG}/parc`);
    await page.getByRole("button", { name: /E2E Lot 1/ }).first().click();
    const f = fenetre(page);
    await expect(f).toBeVisible();

    const documents = f.getByRole("button", { name: "Documents" });
    const comptabilite = f.getByRole("button", { name: /Comptabilité/ });
    await expect(documents).toHaveAttribute("aria-expanded", "false");
    await expect(comptabilite).toHaveAttribute("aria-expanded", "false");
    // Rien du contenu n'est dans l'arbre tant qu'on n'a pas déroulé.
    await expect(f.getByText("Journal du lot")).toHaveCount(0);

    await comptabilite.click();
    await expect(comptabilite).toHaveAttribute("aria-expanded", "true");
    await expect(f.getByText("Journal du lot")).toBeVisible();
    // Le geste que la page « Loyers & charges » portait est ici, sur le lot.
    await expect(f.getByText("Dépense sur ce lot")).toBeVisible();
  });

  test("le rapport annonce ce qu'il couvre AVANT le clic", async ({ page }) => {
    await page.goto(`/agence/${ORG}/parc`);
    await page.getByRole("button", { name: /E2E Lot 1/ }).first().click();
    const f = fenetre(page);
    await f.getByRole("button", { name: /Comptabilité/ }).click();
    await expect(f.getByText(/Rapport de gestion/)).toBeVisible();
    await expect(f.getByText(/Adressé à E2E Mandant/)).toBeVisible();
    await expect(
      f.getByRole("button", { name: /Envoyer le rapport au propriétaire/ })
    ).toBeVisible();
  });

  test("la fenêtre tient dans un téléphone", async ({ page }) => {
    await page.goto(`/agence/${ORG}/parc`);
    await page.getByRole("button", { name: /E2E Lot 1/ }).first().click();
    await expect(fenetre(page)).toBeVisible();
    expect(await debordementHorizontal(page)).toBe(0);
    // Le bouton de fermeture reste atteignable au doigt (audit mobile 10/09).
    const fermer = fenetre(page).getByRole("button", { name: "Fermer" });
    const boite = await fermer.boundingBox();
    expect(boite).not.toBeNull();
    expect(boite!.x + boite!.width).toBeLessThanOrEqual(390);
  });

  test("les deux index ont quitté le menu de l'agent", async ({ page }) => {
    await page.goto(`/agence/${ORG}/parc`);
    const menu = page.getByRole("navigation", { name: "Espace agence" });
    await expect(menu.getByRole("link", { name: /Mon portefeuille/ })).toBeVisible();
    await expect(menu.getByRole("link", { name: /Documents/ })).toHaveCount(0);
    await expect(menu.getByRole("link", { name: /Loyers & charges|Comptabilité/ })).toHaveCount(0);
  });
});

test.describe("Côté admin d'agence", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

  test("l'admin garde ses deux index — sa question porte sur l'ensemble", async ({ page }) => {
    await page.goto(`/agence/${ORG}/parc`);
    const menu = page.getByRole("navigation", { name: "Espace agence" });
    await expect(menu.getByRole("link", { name: /Documents/ })).toBeVisible();
    await expect(menu.getByRole("link", { name: /Comptabilité/ })).toBeVisible();
  });

  test("il ouvre la MÊME fenêtre que l'agent", async ({ page }) => {
    await page.goto(`/agence/${ORG}/parc`);
    await page.getByRole("button", { name: /E2E Lot 1/ }).first().click();
    await expect(fenetre(page).getByText(/E2E Mandant/).first()).toBeVisible();
  });
});

test.describe("Côté locataire", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "locataire.json") });

  test("son logement s'ouvre dans la même fenêtre, à sa portée", async ({ page }) => {
    await page.goto(`/locataire/${ORG}/logement`);
    await page.getByRole("button", { name: /Tout mon logement/ }).click();
    const f = fenetre(page);
    await expect(f).toBeVisible();

    // Ce qu'il voit : son bail, ses loyers, ses documents.
    await expect(f.getByText("Mon bail", { exact: true })).toBeVisible();
    await expect(f.getByRole("button", { name: "Mes loyers" })).toBeVisible();
    await expect(f.getByRole("button", { name: "Documents" })).toBeVisible();

    // Ce qu'il NE voit PAS — et que la base ne lui rend même pas.
    const texte = await f.innerText();
    expect(texte).not.toContain("E2E Mandant");
    expect(texte.toLowerCase()).not.toContain("honoraires");
    expect(texte).not.toContain("Propriétaire");
    // Le pied ne l'envoie pas dans l'espace agence, où il n'entre pas.
    await expect(f.getByRole("link", { name: "Voir mon bail en entier" })).toHaveAttribute(
      "href",
      /^\/locataire\//
    );
  });

  test("« Mes loyers » remplace la comptabilité de l'agence", async ({ page }) => {
    await page.goto(`/locataire/${ORG}/logement`);
    await page.getByRole("button", { name: /Tout mon logement/ }).click();
    const f = fenetre(page);
    await f.getByRole("button", { name: "Mes loyers" }).click();
    await expect(f.getByRole("link", { name: /Voir tous mes paiements/ })).toBeVisible();
    // La comptabilité du lot n'existe pas pour lui.
    await expect(f.getByText("Journal du lot")).toHaveCount(0);
    await expect(f.getByText("Dépense sur ce lot")).toHaveCount(0);
  });
});
