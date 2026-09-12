import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// Les fiches bien et lot, au gabarit téléphone.
//
// CE QUE CES TESTS PROTÈGENT. Le 11/09, les deux fiches empilaient tout à plat :
// un diagnostic manquant se lisait au même poids qu'une ligne « Non
// découpable », le geste s'affichait à neuf cents pixels de son libellé, l'état
// du lot était répété quatre fois, et le bail — la seule chose qu'on vient
// vraiment chercher sur un lot loué — arrivait en dernier, replié, derrière
// neuf caractéristiques dont quatre vides.
//
// L'ORDRE EST LA FONCTIONNALITÉ. On teste donc des POSITIONS, pas seulement des
// présences : un bloc juste, placé en bas, ne sert personne. Une assertion de
// présence aurait laissé passer exactement le défaut qu'on vient de corriger.

test.use({ storageState: path.join(__dirname, ".auth", "agent.json") });

// LES IDENTIFIANTS VIENNENT DE LA MATRICE, PLUS D'UNE CONSTANTE. Ils étaient
// écrits en dur — l'empreinte d'UNE base particulière. Le 12/09, en remontant
// le banc de zéro, ils ont désigné des objets inexistants : huit tests de ce
// fichier au rouge sans qu'une ligne de produit ait bougé. Un test qui ne
// survit pas à la reconstruction de sa base ne teste pas le produit, il teste
// une base. La matrice, elle, est régénérée après chaque seed
// (npm run e2e:matrice) — même idiome que le brouillon d'EDL.
function chemins(): { bien: string; lot: string } {
  const matrice = JSON.parse(
    fs.readFileSync(path.join(__dirname, "matrice-ecrans.json"), "utf8"),
  ) as { path: string }[];
  const lot = matrice.find((e) => /\/parc\/[0-9a-f-]{36}\/lots\/[0-9a-f-]{36}$/.test(e.path));
  const bien = matrice.find((e) => /\/parc\/[0-9a-f-]{36}$/.test(e.path));
  if (!lot || !bien)
    throw new Error("Pas de fiche bien/lot dans la matrice — lancer seed-parcours puis e2e:matrice");
  return { bien: bien.path, lot: lot.path };
}
const { bien: CHEMIN_BIEN, lot: CHEMIN_LOT } = chemins();

test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
});

/** L'ordonnée du haut d'un élément dans le document. */
async function hauteur(page: Page, selecteur: string): Promise<number> {
  return page.locator(selecteur).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top + window.scrollY;
  });
}

test("fiche lot : la location passe avant les caractéristiques", async ({ page }) => {
  await page.goto(CHEMIN_LOT);
  // `CardTitle` rend un <div>, pas un titre : on vise la fente de données.
  await expect(
    page.locator('[data-slot="card-title"]', { hasText: "La location en cours" })
  ).toBeVisible();

  const location = await hauteur(page, "text=La location en cours");
  const leLot = await hauteur(page, "text=Le lot");
  expect(location, "la location doit précéder le bloc du lot").toBeLessThan(leLot);

  // Le locataire et le loyer se lisent sans rien déplier.
  await expect(page.getByText("Locataire E2E")).toBeVisible();
  await expect(page.getByRole("link", { name: /Ouvrir le bail/ })).toBeVisible();
});

test("fiche lot : l'état n'est dit qu'une fois de trop, pas quatre", async ({ page }) => {
  await page.goto(CHEMIN_LOT);
  await expect(
    page.locator('[data-slot="card-title"]', { hasText: "La location en cours" })
  ).toBeVisible();
  const texte = (await page.locator("main").innerText()).toLowerCase();
  // « Loué » : la pastille du titre. « État actuel : Loué » et « Ce lot est
  // loué » ont disparu — deux occurrences restent acceptables (pastille +
  // éventuelle mention dans une section), quatre ne le sont pas.
  const occurrences = texte.split("loué").length - 1;
  expect(occurrences, `« loué » apparaît ${occurrences} fois`).toBeLessThanOrEqual(2);
});

test("fiche lot : les caractéristiques vides ne prennent pas de place", async ({ page }) => {
  await page.goto(CHEMIN_LOT);
  await expect(page.getByText("Non renseigné :")).toBeVisible();
  // Aucune rangée « libellé ↔ — » : les champs vides sont réunis en une phrase.
  const tirets = await page.locator("main dd", { hasText: /^—$/ }).count();
  expect(tirets, "une rangée qui affiche « — » ne dit rien et coûte une ligne").toBe(0);
});

test("fiche lot : une section se déplie en touchant sa rangée, pas un bouton lointain", async ({
  page,
}) => {
  await page.goto(CHEMIN_LOT);
  const rangee = page.getByRole("button", { name: /Diagnostics du lot/ });
  await expect(rangee).toHaveAttribute("aria-expanded", "false");

  // La cible fait toute la largeur : c'est ce qui rend la distance sans objet.
  const boite = await rangee.boundingBox();
  expect(boite!.width, "la rangée entière doit être la cible").toBeGreaterThan(250);
  expect(boite!.height, "cible tactile d'au moins 44 px").toBeGreaterThanOrEqual(44);

  await rangee.click();
  await expect(rangee).toHaveAttribute("aria-expanded", "true");
});

test("fiche bien : les lots passent avant l'administratif", async ({ page }) => {
  await page.goto(CHEMIN_BIEN);
  await expect(
    page.locator('[data-slot="card-title"]').filter({ hasText: /^Le lot$|^Les \d+ lots/ })
  ).toBeVisible();

  const lots = await hauteur(page, "#lots");
  const leBien = await hauteur(page, "text=Le bien");
  expect(lots, "les lots doivent précéder la fiche administrative du bien").toBeLessThan(leBien);
});

test("fiche bien : ce qui manque est dit en haut, avec le chemin pour le régler", async ({
  page,
}) => {
  await page.goto(CHEMIN_BIEN);
  const bandeau = page.getByRole("region", { name: "Ce qui attend un geste" });
  await expect(bandeau).toBeVisible();
  await expect(bandeau).toContainText("Termites");
  // Le lien mène à la section concernée, et l'ouvre.
  await bandeau.getByRole("link", { name: "Régler" }).first().click();
  await expect(page.getByRole("button", { name: /Diagnostics du bien/ })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
});

test("fiche bien : l'annonce aux locataires ne déploie plus son formulaire", async ({ page }) => {
  await page.goto(CHEMIN_BIEN);
  const rangee = page.getByRole("button", { name: /Annonce aux locataires/ });
  await expect(rangee).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Texte de l’annonce")).toHaveCount(0);
});

test("les deux fiches tiennent dans 390 px", async ({ page }) => {
  // On attend le CONTENU, pas le <main> : l'écran de chargement en porte un,
  // et mesurer pendant qu'il tourne rend un verdict sur une page qui n'est pas
  // celle qu'on teste (échec intermittent constaté à l'écriture du test).
  for (const [url, attendu] of [
    [CHEMIN_BIEN, /^Le lot$|^Les \d+ lots/],
    [CHEMIN_LOT, /^Le lot$/],
  ] as const) {
    await page.goto(url);
    await expect(
      page.locator('[data-slot="card-title"]').filter({ hasText: attendu }).first()
    ).toBeVisible();
    expect(await debordementHorizontal(page), url).toBe(0);
  }
});
