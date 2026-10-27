import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import { sansSyntheseAlertes, debordementHorizontal } from "./aides";

const base = "/espace/3c1d1e95-3570-400b-8012-44530be145b1";
test.use({ storageState: path.join(__dirname, ".auth/proprietaire.json") });
test.beforeEach(async ({ page }) => { await sansSyntheseAlertes(page); });

test("clavier : accès direct au contenu sans traverser le menu", async ({ page }) => {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.keyboard.press("Tab");
  const lien = page.getByRole("link", { name: "Aller au contenu", exact: true });
  await expect(lien).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".coquille-corps main")).toBeFocused();
});

test("une seule aide dans le menu conserve l’adresse propriétaire", async ({ page }) => {
  const erreurs: string[] = [];
  page.on("console", message => { if (message.type() === "error") erreurs.push(message.text()); });
  await page.goto(base, { waitUntil: "networkidle" });
  const menuMobile = page.locator(".coquille-basse button[data-assistance]");
  if (await menuMobile.isVisible()) await menuMobile.click();
  const aide = page.getByRole("link", { name: "Aide", exact: true });
  await expect(aide).toHaveCount(1);
  await expect(aide).toHaveAttribute("href", `${base}/faq`);
  await expect(page.locator(".coquille-haut [data-assistance]")).toHaveCount(0);
  await aide.click();
  await expect(page).toHaveURL(`${base}/faq`);
  expect(erreurs).toEqual([]);
});

for (const largeur of [390, 768, 1440]) {
  test(`fiche de lot : accès direct, clavier et retour à ${largeur}px`, async ({ page }, info) => {
    await page.setViewportSize({ width: largeur, height: 950 });
    await page.goto(`${base}/parc`, { waitUntil: "networkidle" });
    const ouvrir = page.locator("a[data-lot-id]").filter({ hasText: "Appartement T2" }).first();
    const href = await ouvrir.getAttribute("href");
    expect(href).toMatch(/\/parc\/[0-9a-f-]+\/lots\/[0-9a-f-]+$/);
    await ouvrir.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(href!);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("tablist")).toHaveCount(0);
    for (const nom of ["Le logement", "Le bâtiment", "Locataires & garants", "Le bail", "Incidents"]) {
      await expect(page.getByRole("heading", { name: nom, exact: true })).toBeVisible();
    }
    const documents = page.locator("details#documents-lot");
    await expect(documents).not.toHaveAttribute("open", "");
    const ouvrirDocuments = documents.locator(":scope > summary");
    await ouvrirDocuments.focus();
    await expect(ouvrirDocuments).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(documents).toHaveAttribute("open", "");
    await expect(documents.getByRole("link", { name: "Ouvrir la bibliothèque", exact: true })).toBeVisible();
    await page.keyboard.press("Space");
    await expect(documents).not.toHaveAttribute("open", "");
    expect(await debordementHorizontal(page)).toBe(0);
    expect((await new AxeBuilder({ page }).include(".dossier-location").withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`fiche-lot-${largeur}.png`), fullPage: true });
    await page.getByRole("link", { name: "← Biens & locations", exact: true }).click();
    await expect(page).toHaveURL(`${base}/parc`);
    await expect(ouvrir).toBeVisible();
  });
}

test("tablette : chaque libellé du rail reste lisible sans césure", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 950 });
  await page.goto(base, { waitUntil: "networkidle" });
  const rail = page.locator(".coquille-late");
  expect((await rail.boundingBox())!.width).toBeGreaterThanOrEqual(100);
  const libelles = await rail.locator(".coquille-menu .lib:visible").evaluateAll(els => els.map(el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return { texte: el.textContent, largeur: r.width, lignes: r.height / parseFloat(s.lineHeight), cesure: s.hyphens };
  }));
  expect(libelles.length).toBeGreaterThan(8);
  for (const l of libelles) { expect(l.largeur, l.texte ?? "").toBeGreaterThanOrEqual(72); expect(l.lignes, l.texte ?? "").toBeLessThanOrEqual(3.1); expect(l.cesure).toBe("none"); }
});

for (const largeur of [390, 768, 1440]) test(`dépôt : formulaire et retour directement accessibles à ${largeur}px`, async ({ page }, info) => {
  await page.setViewportSize({ width: largeur, height: 950 });
  await page.goto(`${base}/documents?sel=depot`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1, name: "Déposer un document" })).toBeVisible();
  await expect(page.locator(".barre-filtres")).toHaveCount(0);
  const type = page.getByLabel("Type de document", { exact: true });
  await expect(type).toHaveValue("");
  expect(await type.evaluate((el: HTMLSelectElement) => el.validity.valueMissing)).toBe(true);
  const champ = page.locator('input[type="file"]').first();
  expect((await champ.boundingBox())!.y).toBeLessThan(650);
  expect(await debordementHorizontal(page)).toBe(0);
  await page.screenshot({ path: info.outputPath(`depot-${largeur}.png`), fullPage: true });
  await page.getByRole("link", { name: /Retour aux documents/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Documents", exact: true })).toBeVisible();
});

test("la fiche conserve les dépenses, les documents et l’historique sans modale", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 950 });
  await page.goto(`${base}/parc`, { waitUntil: "networkidle" });
  await page.locator("a[data-lot-id]").filter({ hasText: "Appartement T2" }).first().click();
  const journal = page.locator("details").filter({ has: page.locator("summary", { hasText: "Journal & dépenses" }) });
  await journal.locator("summary").click();
  const libelle = journal.getByLabel("Libellé (facultatif)", { exact: true });
  await libelle.fill("Saisie locale non enregistrée");
  await journal.locator("summary").click();
  await journal.locator("summary").click();
  await expect(libelle).toHaveValue("Saisie locale non enregistrée");
  const documents = page.locator("details#documents-lot");
  await expect(documents).not.toHaveAttribute("open", "");
  await documents.locator(":scope > summary").click();
  await expect(documents.getByRole("link", { name: "Déposer un document", exact: true })).toBeVisible();
  await documents.locator(":scope > summary").click();
  await expect(libelle).toHaveValue("Saisie locale non enregistrée");
  const historique = page.locator("details").filter({ has: page.locator("summary", { hasText: "Historique du lot" }) });
  await historique.locator("summary").click();
  await expect(historique.locator("ol").or(historique.getByText("Rien ne s’est encore passé sur ce lot.", { exact: true }))).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await debordementHorizontal(page)).toBe(0);
});

test("les automatismes ouvrent directement les préférences du profil", async ({ page }) => {
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "Régler les envois", exact: true }).click();
  await expect(page).toHaveURL(`${base}/profil#envois`);
  await expect(page.locator("#envois")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Préférences", exact: true })).toBeVisible();
});

for (const largeur of [390, 1440]) test(`incident : décider puis consulter l’historique à ${largeur}px`, async ({ page }, info) => {
  await page.setViewportSize({ width: largeur, height: 950 });
  await page.goto(`${base}/incidents`, { waitUntil: "networkidle" });
  await page.locator('a[href*="/incidents?sel="]').first().click();
  const dossier = page.locator('.incident-dossier');
  await expect(dossier.locator('#qualification')).toBeVisible();
  await expect(dossier.getByRole('link', { name: 'Prendre une décision', exact: true })).toHaveCount(0);
  const ordre = await dossier.evaluate(el => {
    const qualification = el.querySelector('#qualification')!;
    const historique = el.querySelector('.incident-historique')!;
    return Boolean(qualification.compareDocumentPosition(historique) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(ordre).toBe(true);
  await expect(dossier.locator('.incident-historique')).not.toHaveAttribute('open', '');
  await dossier.getByText('Historique du dossier', { exact: true }).click();
  await expect(dossier.locator('.incident-historique')).toHaveAttribute('open', '');
  expect(await debordementHorizontal(page)).toBe(0);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath(`incident-${largeur}.png`), fullPage: true });
});
