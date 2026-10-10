import { expect, test } from "@playwright/test";
import path from "node:path";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// « Mon abonnement », côté propriétaire bailleur.
//
// CE QUE CES TESTS TIENNENT. Un écran de facturation ment de deux façons : en
// annonçant un montant faux, et en proposant un geste qui n'aboutira pas. Les
// deux se voient ici — grille du 28/09/2026 : la formule la moins chère qui
// couvre le parc est proposée avec son montant, l'annuel dit ce qu'il prélève,
// et rien ne part sans une confirmation explicite.
//
// LE BANC N'A PAS DE CLÉS STRIPE, et c'est délibéré : on vérifie que le refus
// est une phrase que son destinataire comprend, pas une erreur d'API. C'est
// exactement l'état dans lequel se trouve la production tant que le compte
// Stripe n'est pas ouvert.

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";

// CHAQUE PUBLIC DANS SON BLOC, et ce n'est pas de la cosmétique : un
// `beforeEach` au niveau du fichier s'exécute AUSSI pour les blocs imbriqués,
// et enverrait la session de l'agence sur l'espace du propriétaire — qui la
// renvoie à /espaces, faute d'adhésion. Le test échouerait avant d'avoir
// commencé, sur un défaut qui n'existe pas.
test.describe("Côté propriétaire bailleur", () => {
  test.use({
    storageState: path.join(__dirname, ".auth", "proprietaire.json"),
  });

  test.beforeEach(async ({ page }) => {
    await sansSyntheseAlertes(page);
    await page.goto(`/agence/${ORG}/abonnement`);
    await expect(
      page.getByRole("heading", { name: "Mon abonnement" }),
    ).toBeVisible();
  });

  test("les deux lots de démonstration recommandent Bailleur avec le montant affiché", async ({
    page,
  }) => {
    const recap = page.locator(".rounded-lg").filter({ hasText: "Récapitulatif avant paiement" });
    await expect(page.getByText("Recommandée : la moins chère qui couvre votre portefeuille")).toBeVisible();
    await expect(recap).toContainText("Formule Bailleur");
    await expect(recap).toContainText("9,99");
    await expect(recap).toContainText("Total à payer TTC");
    await expect(page.locator("main")).not.toContainText("offert, à vie");
  });

  test("en annuel, le montant prélevé en une fois est affiché", async ({ page }) => {
    await page.getByText("Annuel — deux mois offerts").click();
    const recap = page.locator(".rounded-lg").filter({ hasText: "Récapitulatif avant paiement" });
    await expect(recap).toContainText("99,90");
    await expect(recap).toContainText("prélevés en une fois pour douze mois");
  });

  test("sans paiement en ligne ouvert, le refus est une phrase, pas une erreur d'API", async ({
    page,
  }) => {
    // Le banc n'a pas de clés Stripe : la souscription reste
    // fermée, et l'écran le dit au lieu d'offrir un bouton qui échouerait.
    const main = page.locator("main");
    await expect(main).toContainText("n'est pas encore ouvert");
    await expect(main).not.toContainText("STRIPE");
    await expect(main).not.toContainText("Error");
    await expect(page.getByRole("button", { name: /paiement sécurisé/ })).toHaveCount(0);
  });

  test("aucun identifiant Stripe ne descend jusqu'au navigateur", async ({
    page,
  }) => {
    // `mon_abonnement` ne rend ni l'identifiant client ni celui de la
    // souscription : ils ne servent à rien dans un navigateur et tout à qui les
    // collecte. Le test lit la page ENTIÈRE, code compris.
    const html = await page.content();
    expect(html).not.toMatch(/\bcus_[A-Za-z0-9]/);
    expect(html).not.toMatch(/\bsub_[A-Za-z0-9]/);
    expect(html).not.toMatch(/\bsk_(test|live)_/);
  });

  test("l'écran tient dans 390 px", async ({ page }) => {
    expect(await debordementHorizontal(page)).toBe(0);
  });
});

// ── Côté agence : même écran, autre unité et autre barème ──────────────────
//
// L'écran n'existait pas pour les agences avant la grille du 12/09 : elles
// n'avaient aucun moyen de savoir ce qu'elles payaient, ni de payer. Ce qu'on
// vérifie ici est ce qu'une agence doit y lire — des LOTS, pas des biens, et
// le barème qui produit son montant.
test.describe("Côté agence", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });
  const AGENCE = "c14c3187-1258-4e58-8822-368c6007e3fa";

  test.beforeEach(async ({ page }) => {
    await sansSyntheseAlertes(page);
    await page.goto(`/agence/${AGENCE}/abonnement`);
    await expect(
      page.getByRole("heading", { name: "Mon abonnement" }),
    ).toBeVisible();
  });

  test("l'écran compte des LOTS SOUS MANDAT, pas des biens", async ({
    page,
  }) => {
    // Le défaut que la grille corrige : en comptant les biens, un immeuble de
    // trente lots aurait compté pour un.
    await expect(page.getByText("Lots sous mandat actif")).toBeVisible();
    await expect(page.locator("main")).not.toContainText(
      "1ᵉʳ bien — offert, à vie",
    );
  });

  test("le barème est montré tranche par tranche, HT, avant paiement", async ({
    page,
  }) => {
    // Une facture qu'on ne peut pas recalculer soi-même est une facture qu'on
    // appelle pour contester. Tranches cumulatives : chaque lot au prix de SA
    // tranche.
    const recap = page.locator(".rounded-lg").filter({ hasText: "Récapitulatif avant paiement" });
    await expect(recap).toContainText("Socle — jusqu'à 10 lots inclus");
    await expect(recap).toContainText("Lots du 11ᵉ au 50ᵉ");
    await expect(recap).toContainText("Total HT");
  });

  test("aucun identifiant Stripe ne descend jusqu'au navigateur", async ({
    page,
  }) => {
    const html = await page.content();
    expect(html).not.toMatch(/\bcus_[A-Za-z0-9]/);
    expect(html).not.toMatch(/\bsub_[A-Za-z0-9]/);
  });

  test("l'écran tient dans 390 px", async ({ page }) => {
    expect(await debordementHorizontal(page)).toBe(0);
  });
});

// Un agent n'est pas le responsable : la facture de l'agence ne le regarde pas,
// et la base refuse déjà de la lui rendre. L'écran doit refuser AUSSI — sans
// quoi il afficherait une page vide au lieu d'un refus net.
test.describe("Un agent ne voit pas la facture de son agence", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "agent.json") });

  test("l'écran est introuvable pour un agent", async ({ page }) => {
    await sansSyntheseAlertes(page);
    await page.goto("/agence/c14c3187-1258-4e58-8822-368c6007e3fa/abonnement");
    // On vérifie CE QUE L'AGENT VOIT, pas le code HTTP : en développement,
    // Next sert sa page « introuvable » dans une enveloppe 200 (le squelette
    // part avant que la page ne décide). Le code varierait selon le mode ; le
    // contenu, lui, est ce qui compte.
    await expect(page.locator("body")).toContainText("404");
    const texte = await page.locator("body").innerText();
    // Ni montant, ni bouton : la facture de l'agence ne le regarde pas.
    expect(texte).not.toContain("Mon abonnement");
    expect(texte).not.toContain("Total mensuel");
    expect(texte).not.toMatch(/S'abonner/);
  });
});
