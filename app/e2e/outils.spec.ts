import { test, expect, type Page } from "@playwright/test";
import { debordementHorizontal } from "./aides";

// OUTILS GRATUITS (29/09) — pages publiques, sans session. Chaque outil
// affiche son résultat clé, tient dans 390 px sans défilement horizontal,
// offre des cibles de 44 px et ne lève aucune erreur dans la console.
//
// Sans dépendance au setup des comptes : `--no-deps` suffit pour la jouer
// seule (npx playwright test --config e2e/playwright.config.ts
// --project mobile --no-deps e2e/outils.spec.ts).

test.use({ storageState: { cookies: [], origins: [] } });

function surveillerConsole(page: Page): string[] {
  const erreurs: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") erreurs.push(m.text());
  });
  page.on("pageerror", (e) => erreurs.push(e.message));
  return erreurs;
}

async function verifierPage(page: Page, erreurs: string[]) {
  expect(await debordementHorizontal(page), "débordement horizontal").toBeLessThanOrEqual(0);
  // Cibles tactiles : les champs, listes et boutons de la page font 44 px.
  const petites = await page.evaluate(() =>
    [...document.querySelectorAll("main input:not([type=checkbox]), main select, main button")]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .filter((el) => el.getBoundingClientRect().height < 43.5)
      .map((el) => el.id || el.textContent?.trim() || el.tagName)
  );
  expect(petites, "cibles de moins de 44 px").toEqual([]);
  const cta = page.getByRole("link", { name: "Créer mon compte — 14 jours d'essai" });
  await expect(cta).toHaveAttribute("href", "/inscription");
  expect(erreurs, "erreurs de console").toEqual([]);
}

test("index /outils : les cinq outils, sans débordement", async ({ page }) => {
  const erreurs = surveillerConsole(page);
  await page.goto("/outils");
  await expect(page.getByRole("heading", { level: 1, name: "Outils gratuits" })).toBeVisible();
  for (const nom of [
    "Calcul de la révision de loyer (IRL)",
    "Quittance de loyer",
    "Comparateur GLI / Visale",
    "Simulateur LMNP",
    "Rentabilité locative",
  ]) {
    await expect(page.getByRole("heading", { level: 2, name: nom })).toBeVisible();
  }
  await verifierPage(page, erreurs);
});

test("calcul IRL : 850 € × 148,37 ÷ 146,68 = 859,79 €, alerte au-delà d'un an", async ({ page }) => {
  const erreurs = surveillerConsole(page);
  await page.goto("/outils/calcul-irl");
  await expect(page.getByTestId("irl-nouveau-loyer")).toHaveText(/859,79\s€/);
  await expect(page.locator("#lettre")).toContainText("859,79");
  await expect(page.getByRole("link", { name: /série de l'IRL publiée par l'Insee/ })).toHaveAttribute(
    "href",
    "https://www.insee.fr/fr/statistiques/serie/001515333"
  );
  await verifierPage(page, erreurs);
  await page.getByLabel("Année").nth(1).selectOption("2027");
  await expect(page.getByTestId("irl-alertes")).toContainText("Plus d'un an");
  // À l'impression, seule la lettre part sur papier.
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#lettre")).toBeVisible();
  await expect(page.getByLabel("Loyer actuel hors charges")).toBeHidden();
  await expect(page.getByRole("link", { name: "Créer mon compte — 14 jours d'essai" })).toBeHidden();
  await expect(page.locator("footer")).toBeHidden();
});

test("quittance : 850 + 120, reçu 500 → reçu de paiement partiel, reste dû 470,00 €", async ({ page }) => {
  const erreurs = surveillerConsole(page);
  await page.goto("/outils/quittance-de-loyer");
  await expect(page.getByTestId("q-total")).toHaveText(/970,00\s€/);
  await expect(page.getByTestId("q-type")).toHaveText("Quittance de loyer");
  await expect(page.getByLabel("Montant reçu")).toHaveValue("970");
  await page.getByLabel("Montant reçu").fill("500");
  await expect(page.getByTestId("q-type")).toHaveText("Reçu de paiement partiel");
  await expect(page.getByTestId("q-reste")).toHaveText(/470,00\s€/);
  await expect(page.locator("#quittance")).toContainText("ne vaut pas quittance");
  const mois = page.getByLabel("Mois", { exact: true });
  const avant = await mois.inputValue();
  await page.getByRole("button", { name: "Mois suivant" }).click();
  await expect(mois).not.toHaveValue(avant);
  await verifierPage(page, erreurs);
  // Retenu sur l'appareil seulement si la case est cochée.
  const bailleur = page.getByLabel("Nom du bailleur");
  const retenir = page.getByLabel(/Retenir le bailleur/);
  await bailleur.fill("Mme Durand");
  await page.reload();
  await expect(bailleur).toHaveValue("");
  await bailleur.fill("Mme Durand");
  await retenir.check();
  await page.reload();
  await expect(bailleur).toHaveValue("Mme Durand");
  await expect(retenir).toBeChecked();
  expect(await page.evaluate(() => localStorage.getItem("gerimmo_quittance"))).toContain("Mme Durand");
  await retenir.uncheck();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("gerimmo_quittance"))).toBeNull();
  // À l'impression, seule la quittance part sur papier.
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#quittance")).toBeVisible();
  await expect(page.getByLabel("Montant reçu")).toBeHidden();
});

test("comparateur : GLI 314,28 € brut, 165,94 € net ; 30 ans et plus « Autre » → Visale exclue", async ({ page }) => {
  const erreurs = surveillerConsole(page);
  await page.goto("/outils/comparateur-gli-visale");
  await expect(page.getByTestId("cmp-gli-brut")).toHaveText(/314,28\s€/);
  await expect(page.getByTestId("cmp-gli-net")).toHaveText(/165,94\s€/);
  await expect(page.getByTestId("cmp-visale-verdict")).toHaveText("Visale est possible");
  await page.getByLabel("Âge du locataire").selectOption("30-plus");
  await page.getByLabel("Situation du locataire").selectOption("autre");
  await expect(page.getByTestId("cmp-visale-verdict")).toHaveText("Visale est exclue");
  await expect(page.getByText(/revérifier chaque mois de janvier/)).toBeVisible();
  await verifierPage(page, erreurs);
});

test("LMNP : réel 0,00 €, micro 2 265,60 €, amortissement reporté 554,29 €", async ({ page }) => {
  const erreurs = surveillerConsole(page);
  await page.goto("/outils/simulateur-lmnp");
  await expect(page.getByTestId("lmnp-impot-reel")).toHaveText(/^0,00\s€$/);
  await expect(page.getByTestId("lmnp-impot-micro")).toHaveText(/2\s265,60\s€/);
  await expect(page.getByTestId("lmnp-economie")).toHaveText(/2\s265,60\s€/);
  await expect(page.getByTestId("lmnp-reporte")).toContainText(/554,29\s€/);
  await expect(page.getByText(/meublés de tourisme/)).toBeVisible();
  await verifierPage(page, erreurs);
});

test("rentabilité : brute 5,29 %, nette 4,08 %, cash-flow −350,44 €", async ({ page }) => {
  const erreurs = surveillerConsole(page);
  await page.goto("/outils/rentabilite-locative");
  await expect(page.getByTestId("rt-brute")).toHaveText(/5,29\s%/);
  await expect(page.getByTestId("rt-nette")).toHaveText(/4,08\s%/);
  await expect(page.getByTestId("rt-cashflow")).toHaveText(/-350,44\s€/);
  await verifierPage(page, erreurs);
});
