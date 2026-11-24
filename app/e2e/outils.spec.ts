import { test, expect, type Page } from "@playwright/test";
import { debordementHorizontal } from "./aides";
import { dureeEssai } from "../src/lib/tarifs";

const CTA_ESSAI = `Créer mon compte — ${dureeEssai()} d'essai`;

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

/**
 * La page de la quittance est prête à recevoir une saisie quand elle a posé la date du jour (elle le fait à son
 * montage, dans le navigateur). Saisir avant, c'est écrire dans un champ que la page remet aussitôt à sa valeur
 * de départ : le parcours échouait alors environ une fois sur cinq, avec « 850 » revenu à la place de la saisie
 * (constat du 22/11/2026, reproduit à l'identique sur la version précédente).
 */
async function quittancePrete(page: Page) {
  await expect(page.getByLabel("Mois", { exact: true })).not.toHaveValue("");
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
  const cta = page.getByRole("link", { name: CTA_ESSAI });
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

test("calcul IRL : rien de prérempli, 850 € × 148,37 ÷ 146,68 = 859,79 €, lettre complète seulement, alerte au-delà d'un an, DPE F bloque", async ({ page }) => {
  const erreurs = surveillerConsole(page);
  // Les suggestions d'adresse (Base Adresse Nationale) ne sortent pas du banc : réponse vide, sans réseau.
  await page.route("https://api-adresse.data.gouv.fr/**", (route) => route.fulfill({ json: { features: [] } }));
  await page.goto("/outils/calcul-irl");
  // 30/09 : la série de l'Insee est lue côté serveur. Chargée, l'outil choisit
  // les indices lui-même ; sinon (réseau fermé, comme en local), saisie
  // manuelle. Le test saisit ses propres indices dans les deux cas.
  const manuel = page.getByRole("button", { name: "Saisir les indices moi-même" });
  const indisponible = page.getByTestId("irl-serie-indisponible");
  // Attendre que l'un des deux états soit rendu avant de trancher : `isVisible`
  // ne patiente pas, et tranchait parfois avant l'hydratation (CI du 30/09).
  await expect(manuel.or(indisponible).first()).toBeVisible();
  const reference = page.getByRole("group", { name: "Indice de référence" });
  const nouveau = page.getByRole("group", { name: "Nouvel indice" });
  const imprimer = page.getByRole("button", { name: "Imprimer la lettre" });
  // Décision du dirigeant du 25/11/2026 : aucun champ n'est prérempli (ni le loyer, ni la date du bail, ni la classe
  // énergétique, ni la date de la lettre) ; l'exemple du loyer n'est qu'un texte indicatif, et chaque champ garde son
  // libellé. Rien n'est calculé et la lettre ne s'imprime pas, avec la raison.
  const loyer = page.getByLabel("Loyer actuel hors charges");
  await expect(loyer).toHaveValue("");
  await expect(loyer).toHaveAttribute("placeholder", "Ex. 850");
  await expect(page.getByLabel("Date de la lettre")).toHaveValue("");
  await expect(page.getByRole("group", { name: "Classe énergétique (DPE) du logement" }).getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(page.getByTestId("irl-etat")).toHaveText("À compléter");
  await expect(page.getByTestId("irl-nouveau-loyer")).toHaveCount(0);
  await expect(imprimer).toBeDisabled();
  await expect(page.getByTestId("irl-lettre-manque")).toContainText("complétez d'abord le calcul du nouveau loyer");
  if (await manuel.isVisible()) {
    await expect(page.getByLabel("Date de signature du bail ou de la dernière révision")).toHaveValue("");
    await expect(page.getByRole("group", { name: "Trimestre de référence du bail" }).getByRole("radio", { checked: true })).toHaveCount(0);
    await expect(page.getByText("Renseignez le loyer hors charges actuel et la date de signature du bail", { exact: false })).toBeVisible();
    // Sans date saisie, « Saisir les indices moi-même » ne reprend aucun trimestre ni aucune année.
    await manuel.click();
  }
  // Saisie manuelle (série non lue, ou choisie) : trimestres, années et indices vides — E054 = E167 pour les indices
  // (l'exemple écrit dans le code s'affichait comme un indice de l'Insee), décision du 25/11/2026 pour le reste.
  for (const groupe of [reference, nouveau]) {
    await expect(groupe.getByLabel("Valeur de l'indice")).toHaveValue("");
    await expect(groupe.getByLabel("Année")).toHaveValue("");
    await expect(groupe.getByRole("radio", { checked: true })).toHaveCount(0);
  }
  await expect(page.getByText("le trimestre et l'année de l'indice de référence", { exact: false })).toBeVisible();
  await loyer.fill("850");
  await reference.getByRole("radio", { name: "T2" }).check();
  await reference.getByLabel("Année").selectOption("2025");
  await reference.getByLabel("Valeur de l'indice").fill("146,68");
  await nouveau.getByRole("radio", { name: "T2" }).check();
  await nouveau.getByLabel("Année").selectOption("2026");
  await nouveau.getByLabel("Valeur de l'indice").fill("148,37");
  await expect(page.getByTestId("irl-nouveau-loyer")).toHaveText(/859,79\s€/);
  await expect(page.getByTestId("irl-etat")).toHaveText("Indices cohérents");
  await expect(page.locator("#lettre")).toContainText("859,79");
  // Le calcul est fait, mais la lettre n'est pas complète : l'impression reste impossible, le message dit quoi saisir,
  // et l'impression par le navigateur ne sort pas la lettre.
  await expect(imprimer).toBeDisabled();
  await expect(page.getByTestId("irl-lettre-manque")).toHaveText(
    "Pour imprimer la lettre, renseignez le nom du bailleur, l'adresse du bailleur, le nom du locataire, l'adresse du logement, la date de la lettre et la date d'effet de la révision."
  );
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#lettre")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page.getByLabel("Nom du bailleur").fill("Durand Paul");
  await page.getByLabel("Adresse du bailleur").fill("3 rue Fictive, 75011 Paris");
  await page.getByLabel("Nom du locataire").fill("Martin Claire");
  await page.getByLabel("Adresse du logement loué").fill("8 avenue Exemple, 69003 Lyon");
  await page.getByLabel("Date de la lettre").fill("2026-07-25");
  await page.getByLabel("Date d'effet de la révision").fill("2026-08-01");
  await expect(imprimer).toBeEnabled();
  await expect(page.getByTestId("irl-lettre-manque")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /série de l'IRL publiée par l'Insee/ }).first()).toHaveAttribute(
    "href",
    "https://www.insee.fr/fr/statistiques/serie/001515333"
  );
  await verifierPage(page, erreurs);
  await nouveau.getByLabel("Année").selectOption("2027");
  await expect(page.getByTestId("irl-alertes")).toContainText("Plus d'un an");
  await nouveau.getByLabel("Année").selectOption("2026");
  // À l'impression, seule la lettre part sur papier.
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#lettre")).toBeVisible();
  await expect(page.getByLabel("Loyer actuel hors charges")).toBeHidden();
  await expect(page.getByRole("link", { name: CTA_ESSAI })).toBeHidden();
  await expect(page.locator("footer")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  // DPE F : révision interdite, aucune lettre.
  await page.getByRole("group", { name: "Classe énergétique (DPE) du logement" }).getByRole("radio", { name: "F" }).check();
  await expect(page.getByTestId("irl-gel-dpe")).toContainText("24 août 2022");
  await expect(page.getByTestId("irl-nouveau-loyer")).toHaveCount(0);
  await expect(page.locator("#lettre")).toHaveCount(0);
});

test("quittance : 850 + 120, reçu 500 → reçu de paiement partiel, reste dû 470,00 €", async ({ page }) => {
  const erreurs = surveillerConsole(page);
  await page.goto("/outils/quittance-de-loyer");
  await quittancePrete(page);
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
  await page.getByRole("radio", { name: "30 ans ou plus" }).check();
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

test("quittance publique : aucun document sans paiement valide, excédent hors du terme", async ({ page }) => {
  await page.goto("/outils/quittance-de-loyer");
  await quittancePrete(page);
  const recu = page.getByLabel("Montant reçu");
  const loyer = page.getByLabel("Loyer hors charges");
  const document = page.locator("#quittance");
  for (const [montantLoyer, paiement] of [["illisible", "500"], ["-1", "500"], ["850", "0"], ["850", ""]]) {
    await loyer.fill(montantLoyer);
    await recu.fill(paiement);
    await expect(page.getByRole("heading", { name: "Document à compléter" })).toBeVisible();
    await expect(document).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Imprimer (la quittance|le reçu)/ })).toHaveCount(0);
  }

  await recu.fill("1200");
  await expect(document).toContainText(/somme de 970,00\s*€/);
  await expect(document).toContainText(/versement total est de 1\s200,00\s*€/);
  await expect(document).toContainText(/excédent de 230,00\s*€ ne fait pas partie du terme/);
  await page.emulateMedia({ media: "print" });
  await expect(document).toBeVisible();
});
