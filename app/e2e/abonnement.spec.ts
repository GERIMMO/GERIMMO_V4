import { expect, test } from "@playwright/test";
import path from "node:path";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// « Mon abonnement », côté propriétaire bailleur.
//
// CE QUE CES TESTS TIENNENT. Un écran de facturation ment de deux façons : en
// annonçant un montant faux, et en proposant un geste qui n'aboutira pas. Les
// deux se voient ici — le décompte vient de la base (1ᵉʳ bien offert à vie,
// 5,99 €/mois ensuite), et le bouton n'apparaît que quand il y a quelque chose
// à payer.
//
// LE BANC N'A PAS DE CLÉS STRIPE, et c'est délibéré : on vérifie que le refus
// est une phrase que son destinataire comprend, pas une erreur d'API. C'est
// exactement l'état dans lequel se trouve la production tant que le compte
// Stripe n'est pas ouvert.

test.use({ storageState: path.join(__dirname, ".auth", "proprietaire.json") });

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";

test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
  await page.goto(`/agence/${ORG}/abonnement`);
  await expect(page.getByRole("heading", { name: "Mon abonnement" })).toBeVisible();
});

test("le décompte nomme chaque bien, et dit lequel est offert", async ({ page }) => {
  const carte = page.locator(".loc-carte").filter({ hasText: "Formule Gerimmo" });
  await expect(carte).toContainText("1ᵉʳ bien — offert, à vie");
  await expect(carte).toContainText("5,99 €/mois");
  await expect(carte).toContainText("Total mensuel");
});

test("le bouton porte le montant : on sait ce qu'on engage avant de cliquer", async ({ page }) => {
  // Un bouton « S'abonner » nu oblige à faire confiance. Celui-ci dit combien.
  await expect(page.getByRole("button", { name: /S'abonner — .* par mois/ })).toBeVisible();
});

test("sans compte Stripe ouvert, le refus est une phrase, pas une erreur d'API", async ({
  page,
}) => {
  await page.getByRole("button", { name: /S'abonner/ }).click();
  // Portée à `main` : Next.js pose son propre role="alert" (l'annonceur de
  // route) sur toute page, et il est vide.
  const alerte = page.locator("main").getByRole("alert");
  await expect(alerte).toBeVisible();
  await expect(alerte).toContainText("n'est pas encore ouvert");
  // Ni nom de variable, ni mot anglais : celui qui lit est un bailleur.
  await expect(alerte).not.toContainText("STRIPE");
  await expect(alerte).not.toContainText("Error");
});

test("aucun identifiant Stripe ne descend jusqu'au navigateur", async ({ page }) => {
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
