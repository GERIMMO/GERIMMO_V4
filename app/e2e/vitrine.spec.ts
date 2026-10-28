import { test, expect } from "@playwright/test";
import { debordementHorizontal } from "./aides";
import { FORMULES_PARTICULIER } from "../src/lib/tarifs";

test.use({ storageState: { cookies: [], origins: [] } });

for (const chemin of ["/", "/tarifs"]) {
  test(`vitrine ${chemin} : les tarifs changent sans ambiguïté entre mois et année`, async ({ page }) => {
    await page.goto(chemin);
    const offres = page.locator(".offres-grille");
    const montants = () => offres.locator(".offre-prix").allTextContents();
    expect((await montants()).map(t => Number(t.split("€")[0].trim().replace(",", ".")))).toEqual(FORMULES_PARTICULIER.map(f => f.mensuelCents / 100));
    await page.getByRole("button", { name: /Annuel/ }).click();
    await expect(page.getByRole("button", { name: /Annuel/ })).toHaveAttribute("aria-pressed", "true");
    await expect(offres.locator(".offre-periode").first()).toHaveText("Prélevé en une fois pour 12 mois");
    expect((await montants()).map(t => Number(t.split("€")[0].trim().replace(",", ".")))).toEqual(FORMULES_PARTICULIER.map(f => f.annuelCents / 100));
    for (const lien of await offres.getByRole("link", { name: "Créer mon compte" }).all()) await expect(lien).toHaveAttribute("href", "/inscription");
    await page.getByRole("button", { name: "Mensuel", exact: true }).click();
    await expect(offres.locator(".offre-periode").first()).toHaveText("Sans engagement");
    expect(await debordementHorizontal(page)).toBe(0);
  });
}

test("vitrine mobile : navigation, fermeture du menu et questions fréquentes", async ({ page }) => {
  await page.goto("/");
  const menu = page.locator(".public-menu-mobile");
  await menu.locator("summary").click();
  await expect(menu.getByRole("link", { name: "Outils gratuits" })).toBeVisible();
  await menu.getByRole("link", { name: "La solution" }).click();
  await expect(page).toHaveURL(/#fonctionnalites$/);
  await expect(menu).not.toHaveAttribute("open");
  await menu.locator("summary").click();
  await menu.locator("summary").press("Escape");
  await expect(menu).not.toHaveAttribute("open");
  const question = page.locator(".public-faq details").filter({ hasText: "Gerimmo lit-il mes comptes bancaires ?" });
  await question.locator("summary").click();
  await expect(question.locator("p")).toBeVisible();
  await menu.locator("summary").click();
  await menu.getByRole("link", { name: "Tarifs", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tarifs", exact: true })).toBeVisible();
  expect(await debordementHorizontal(page)).toBe(0);
});

// Audit final du 27/10/2026 (PUB-03, PUB-14) : les adresses inconnues répondent un vrai 404, sans détour par la
// connexion ; favicon.ico est une icône.
test("adresses inconnues : 404 réel ; favicon.ico servi", async ({ request }) => {
  for (const adresse of ["/journal/article-qui-n-existe-pas", "/journal/%3Cscript%3E", "/conditions/versions/conditions_clients/2020-01-01", "/humans.txt", "/.well-known/security.txt", "/_introuvable"]) {
    const r = await request.get(adresse, { maxRedirects: 0 });
    expect(r.status(), adresse).toBe(404);
  }
  const icone = await request.get("/favicon.ico");
  expect(icone.status()).toBe(200);
  expect(icone.headers()["content-type"]).toMatch(/image\/(x-icon|vnd\.microsoft\.icon)/);
});
