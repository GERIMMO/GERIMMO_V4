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
function chemins(): { bien: string; lot: string; bail: string } {
  const matrice = JSON.parse(
    fs.readFileSync(path.join(__dirname, "matrice-ecrans.json"), "utf8"),
  ) as { path: string }[];
  const lot = matrice.find((e) => /\/parc\/[0-9a-f-]{36}\/lots\/[0-9a-f-]{36}$/.test(e.path));
  const bien = matrice.find((e) => /\/parc\/[0-9a-f-]{36}$/.test(e.path));
  const bail = matrice.find((e) => /\/baux\/[0-9a-f-]{36}$/.test(e.path));
  if (!lot || !bien || !bail)
    throw new Error("Pas de fiche bien/lot dans la matrice — lancer seed-parcours puis e2e:matrice");
  return { bien: bien.path, lot: lot.path, bail: bail.path };
}
const { bien: CHEMIN_BIEN, lot: CHEMIN_LOT, bail: CHEMIN_BAIL } = chemins();

test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
});

test("suivi du bail : choisir une action et retrouver les liens directs", async ({ page }) => {
  await page.goto(CHEMIN_BAIL);
  await page.getByRole("tab", { name: "Suivi", exact: true }).click();
  await expect(page.locator("#enc-montant")).toBeHidden();
  for (const id of ["loyers", "edl", "depot", "avenant"]) {
    await expect(page.locator(`#${id} > summary`)).toBeVisible();
  }
  await page.locator("#loyers > summary").click();
  await expect(page.locator("#enc-montant")).toBeVisible();
  await page.getByRole("tab", { name: "Documents", exact: true }).click();
  await expect(page.locator("#enc-montant")).toBeHidden();
  await page.goto(`${CHEMIN_BAIL}#loyers`);
  await expect(page.getByRole("tab", { name: "Suivi", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#enc-montant")).toBeVisible();
  await page.goto(`${CHEMIN_BAIL}#depot`);
  await expect(page.locator("#depot")).toHaveAttribute("open", "");
  expect(await debordementHorizontal(page)).toBe(0);
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
    page.locator('#location-apercu').getByRole('heading', { name: 'Locataire E2E', exact: true })
  ).toBeVisible();

  await expect(page.getByRole("navigation", { name: "Rubriques du logement" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Résumé", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Le logement", exact: true })).toBeHidden();

  // Le locataire et le loyer se lisent sans rien déplier.
  await expect(page.locator("#location-apercu").getByText("Locataire E2E", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Caractéristiques du logement" })).toBeHidden();
  await expect(page.getByRole("link", { name: /Ouvrir le bail/ })).toBeVisible();
});

test("fiche lot : l'état n'est dit qu'une fois de trop, pas quatre", async ({ page }) => {
  await page.goto(CHEMIN_LOT);
  await expect(
    page.locator('#location-apercu').getByRole('heading', { name: 'Locataire E2E', exact: true })
  ).toBeVisible();
  const texte = (await page.locator("main").innerText()).toLowerCase();
  // « Loué » : la pastille du titre. « État actuel : Loué » et « Ce lot est
  // loué » ont disparu — deux occurrences restent acceptables (pastille +
  // éventuelle mention dans une section), quatre ne le sont pas.
  const occurrences = texte.split("loué").length - 1;
  expect(occurrences, `« loué » apparaît ${occurrences} fois`).toBeLessThanOrEqual(2);
});

test("fiche lot : les caractéristiques se consultent avant de modifier", async ({ page }) => {
  await page.goto(CHEMIN_LOT);
  await page.getByRole("tab", { name: "Logement", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Caractéristiques du logement" })).toBeVisible();
  await expect(page.locator("#caracteristiques").getByRole("button", { name: "Modifier", exact: true })).toHaveAttribute("aria-expanded", "false");
  // Les champs vides portent un libellé explicite plutôt qu’un tiret.
  const tirets = await page.locator("main dd", { hasText: /^—$/ }).count();
  expect(tirets, "une rangée qui affiche « — » ne dit rien et coûte une ligne").toBe(0);
});

test("fiche lot : une section se déplie en touchant sa rangée, pas un bouton lointain", async ({
  page,
}) => {
  await page.goto(CHEMIN_LOT);
  await page.getByRole("tab", { name: "Documents", exact: true }).click();
  const rangee = page.getByRole("button", { name: /Diagnostics du lot/ });
  await expect(rangee).toHaveAttribute("aria-expanded", "true");

  // La cible fait toute la largeur : c'est ce qui rend la distance sans objet.
  const boite = await rangee.boundingBox();
  expect(boite!.width, "la rangée entière doit être la cible").toBeGreaterThan(250);
  expect(boite!.height, "cible tactile d'au moins 44 px").toBeGreaterThanOrEqual(44);

  await rangee.click();
  await expect(rangee).toHaveAttribute("aria-expanded", "false");
  await rangee.click();
  await expect(rangee).toHaveAttribute("aria-expanded", "true");
});

test("fiche bien : les lots passent avant l'administratif", async ({ page }) => {
  await page.goto(CHEMIN_BIEN);
  await expect(
    page.locator('[data-slot="card-title"]').filter({ hasText: /^Votre lot|^Les \d+ lots/ })
  ).toBeVisible();

  const lots = await hauteur(page, "#lots");
  const leBien = await hauteur(page, "#informations");
  expect(lots, "les lots doivent précéder la fiche administrative du bien").toBeLessThan(leBien);
});

test("fiche bien : une obligation à confirmer n'est pas annoncée comme manquante", async ({ page }) => {
  await page.goto(CHEMIN_BIEN);
  const fiche = page.locator("main.bien-visuel");
  await expect(fiche.locator("#lots")).toBeVisible();
  await expect(fiche).not.toContainText("à déposer : Termites");
  const rubrique = page.getByRole("button", { name: /Diagnostics du bien/ });
  await rubrique.click();
  await expect(rubrique).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Obligation à confirmer", { exact:true })).toBeVisible();
});

test("fiche bien : l'annonce aux locataires ne déploie plus son formulaire", async ({ page }) => {
  await page.goto(CHEMIN_BIEN);
  const rangee = page.getByRole("button", { name: /Annonces aux locataires/ });
  await expect(rangee).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("Texte de l’annonce")).toBeHidden();
});

test("les deux fiches tiennent dans 390 px", async ({ page }) => {
  // On attend le CONTENU, pas le <main> : l'écran de chargement en porte un,
  // et mesurer pendant qu'il tourne rend un verdict sur une page qui n'est pas
  // celle qu'on teste (échec intermittent constaté à l'écriture du test).
  for (const [url, selecteur] of [
    [CHEMIN_BIEN, '#lots'],
    [CHEMIN_LOT, '#location-apercu'],
  ] as const) {
    await page.goto(url);
    await expect(page.locator(selecteur)).toBeVisible();
    expect(await debordementHorizontal(page), url).toBe(0);
  }
});
