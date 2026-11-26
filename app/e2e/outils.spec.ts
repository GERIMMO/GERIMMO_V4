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
 * Saisit le mois de la quittance une fois la page hydratée. Avant l'hydratation, une saisie n'atteint pas l'état de la
 * page et se perd (constat du 22/11/2026 : « 850 » revenait à la place de la saisie, environ une fois sur cinq). La
 * page ne pose plus de date au montage (Q123) : la preuve qu'elle a pris la main est « Mois suivant », qui ne s'active
 * qu'avec un mois saisi. On refait la saisie jusque-là.
 */
async function quittancePrete(page: Page, mois = "2026-09") {
  const champ = page.getByLabel("Mois", { exact: true });
  const suivant = page.getByRole("button", { name: "Mois suivant" });
  await expect(async () => {
    await champ.fill(mois);
    await expect(suivant).toBeEnabled({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/**
 * Même précaution pour les autres outils (Q123 : ils s'ouvrent vides) : la première saisie est refaite jusqu'à ce que
 * le message de ce qui manque ne cite plus ce champ.
 */
async function premiereSaisie(page: Page, libelle: string, valeur: string, manque: string, cite: string) {
  const champ = page.getByLabel(libelle, { exact: true });
  await expect(async () => {
    await champ.fill(valeur);
    await expect(page.getByTestId(manque)).not.toContainText(cite, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

async function remplir(page: Page, champs: [libelle: string, valeur: string][]) {
  for (const [libelle, valeur] of champs) await page.getByLabel(libelle, { exact: true }).fill(valeur);
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

const MENTIONS_QUITTANCE: [string, string][] = [
  ["Nom du bailleur", "Durand Paul"],
  ["Adresse du bailleur", "3 rue Fictive, 75011 Paris"],
  ["Nom du locataire", "Martin Claire"],
  ["Adresse du logement loué", "8 avenue Exemple, 69003 Lyon"],
];
const MANQUE_MENTIONS =
  "le mode de paiement, le nom du bailleur, l'adresse du bailleur, le nom du locataire et l'adresse du logement loué.";

test("quittance : rien de prérempli ; 850 + 120, reçu 500 → reçu de paiement partiel, reste dû 470,00 € ; impression complète seulement", async ({ page }) => {
  const erreurs = surveillerConsole(page);
  await page.goto("/outils/quittance-de-loyer");
  // Q123 (règle de l'outil IRL, Q100) : ce test lisait 850 + 120 = 970 € et une quittance prête dès l'ouverture. Aucun
  // champ n'est plus prérempli (ni montants, ni mois, ni date du jour, ni mode) : rien n'est produit, rien ne s'imprime.
  for (const libelle of ["Mois", "Date du paiement", "Loyer hors charges", "Provision pour charges", "Montant reçu", "Nom du bailleur"]) {
    await expect(page.getByLabel(libelle, { exact: true }), libelle).toHaveValue("");
  }
  await expect(page.getByLabel("Loyer hors charges")).toHaveAttribute("placeholder", "Ex. 850");
  await expect(page.getByRole("group", { name: "Mode de paiement" }).getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(page.getByTestId("q-etat")).toHaveText("À compléter");
  await expect(page.getByTestId("q-total")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Imprimer (la quittance|le reçu)/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mois suivant" })).toBeDisabled();
  // Inactif, « Mois suivant » dit pourquoi ; le champ du mois n'a pas de texte indicatif (Chromium ne l'affiche pas).
  await expect(page.getByRole("button", { name: "Mois suivant" })).toHaveAccessibleDescription("Saisissez d'abord le mois.");
  await expect(page.getByLabel("Mois", { exact: true })).not.toHaveAttribute("placeholder");
  // Terme incomplet : l'impression par le navigateur sort un court message, pas une page blanche.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("q-incomplet-imprime")).toBeVisible();
  await expect(page.getByTestId("q-incomplet-imprime")).toContainText("Quittance incomplète : renseignez le loyer hors charges");
  await expect(page.getByLabel("Loyer hors charges")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await expect(page.getByTestId("q-incomplet-imprime")).toBeHidden();

  await quittancePrete(page);
  await expect(page.getByRole("button", { name: "Mois suivant" })).toHaveAccessibleDescription("");
  await remplir(page, [["Date du paiement", "2026-09-03"], ["Loyer hors charges", "850"], ["Provision pour charges", "120"]]);
  // Le montant reçu ne suit plus le total : il se saisit, ou se recopie à la demande.
  await expect(page.getByLabel("Montant reçu")).toHaveValue("");
  await page.getByRole("button", { name: /Reprendre le total du terme/ }).click();
  await expect(page.getByLabel("Montant reçu")).toHaveValue("970");
  await expect(page.getByTestId("q-total")).toHaveText(/970,00\s€/);
  await expect(page.getByTestId("q-type")).toHaveText("Quittance de loyer");
  // Le document est prêt, mais incomplet : l'impression reste impossible, le message dit quoi saisir, et l'impression
  // par le navigateur ne sort pas le document.
  const imprimer = page.getByRole("button", { name: "Imprimer la quittance" });
  await expect(imprimer).toBeDisabled();
  await expect(page.getByTestId("q-impression-manque")).toHaveText(`Pour imprimer la quittance, renseignez ${MANQUE_MENTIONS}`);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#quittance")).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  await page.getByLabel("Montant reçu").fill("500");
  await expect(page.getByTestId("q-type")).toHaveText("Reçu de paiement partiel");
  await expect(page.getByTestId("q-reste")).toHaveText(/470,00\s€/);
  await expect(page.locator("#quittance")).toContainText("ne vaut pas quittance");
  await expect(page.getByTestId("q-impression-manque")).toHaveText(`Pour imprimer le reçu, renseignez ${MANQUE_MENTIONS}`);
  await page.getByRole("group", { name: "Mode de paiement" }).getByRole("radio", { name: "Virement" }).check();
  await remplir(page, MENTIONS_QUITTANCE);
  await expect(page.getByRole("button", { name: "Imprimer le reçu" })).toBeEnabled();
  await expect(page.getByTestId("q-impression-manque")).toHaveCount(0);
  await verifierPage(page, erreurs);
  // À l'impression, seul le document part sur papier.
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#quittance")).toBeVisible();
  await expect(page.getByLabel("Montant reçu")).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  // Le mois suivant part du mois saisi ; le paiement du nouveau terme reste à saisir (plus de date du jour).
  const mois = page.getByLabel("Mois", { exact: true });
  await page.getByRole("button", { name: "Mois suivant" }).click();
  await expect(mois).toHaveValue("2026-10");
  await expect(page.getByLabel("Date du paiement")).toHaveValue("");
  await expect(page.getByLabel("Montant reçu")).toHaveValue("");
  await expect(page.getByRole("button", { name: /Imprimer (la quittance|le reçu)/ })).toHaveCount(0);

  // Retenu sur l'appareil seulement si la case est cochée.
  const bailleur = page.getByLabel("Nom du bailleur");
  const retenir = page.getByLabel(/Retenir le bailleur/);
  await page.reload();
  await expect(bailleur).toHaveValue("");
  await quittancePrete(page);
  await bailleur.fill("Mme Durand");
  await retenir.check();
  // L'écriture dans le stockage suit le rendu (effet) : recharger avant qu'elle ait eu lieu perdait la valeur retenue
  // (CI de main : « Nom du bailleur » vide après rechargement). On attend qu'elle soit faite.
  await expect.poll(() => page.evaluate(() => localStorage.getItem("gerimmo_quittance"))).toContain("Mme Durand");
  await page.reload();
  await expect(bailleur).toHaveValue("Mme Durand");
  await expect(retenir).toBeChecked();
  // Ce qui est retenu revient ; le mois et la date ne sont pas posés à la place de l'utilisateur.
  await expect(mois).toHaveValue("");
  expect(await page.evaluate(() => localStorage.getItem("gerimmo_quittance"))).toContain("Mme Durand");
  await retenir.uncheck();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("gerimmo_quittance"))).toBeNull();
});

test("comparateur : rien de prérempli ; GLI 314,28 € brut, 165,94 € net ; 30 ans et plus « Autre » → Visale exclue", async ({ page }) => {
  const erreurs = surveillerConsole(page);
  await page.goto("/outils/comparateur-gli-visale");
  // Q123 : ce test lisait le résultat de l'exemple prérempli (970 €, 2,7 %, 30 %). Tout part vide ; l'exemple se saisit.
  const loyer = page.getByLabel("Loyer mensuel charges comprises");
  await expect(loyer).toHaveValue("");
  await expect(loyer).toHaveAttribute("placeholder", "Ex. 970");
  await expect(page.getByLabel("Taux de la prime")).toHaveValue("");
  await expect(page.getByLabel("Situation du logement")).toHaveValue("");
  await expect(page.locator("main").getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(page.getByTestId("cmp-etat")).toHaveText("À compléter");
  await expect(page.getByTestId("cmp-visale-verdict")).toHaveCount(0);
  await expect(page.getByTestId("cmp-gli-brut")).toHaveCount(0);
  await premiereSaisie(page, "Loyer mensuel charges comprises", "970", "cmp-gli-manque", "le loyer");
  await page.getByLabel("Situation du logement").selectOption("reste");
  await page.getByRole("radio", { name: "Moins de 30 ans" }).check();
  await page.getByLabel("Taux de la prime").fill("2,7");
  await page.getByRole("group", { name: "Tranche marginale d'imposition" }).getByRole("radio", { name: /^30\s%$/ }).check();
  await expect(page.getByTestId("cmp-gli-brut")).toHaveText(/314,28\s€/);
  await expect(page.getByTestId("cmp-gli-net")).toHaveText(/165,94\s€/);
  await expect(page.getByTestId("cmp-visale-verdict")).toHaveText("Visale est possible");
  await page.getByRole("radio", { name: "30 ans ou plus" }).check();
  await page.getByLabel("Situation du locataire").selectOption("autre");
  await expect(page.getByTestId("cmp-visale-verdict")).toHaveText("Visale est exclue");
  await expect(page.getByText(/revérifier chaque mois de janvier/)).toBeVisible();
  await verifierPage(page, erreurs);
});

test("LMNP : rien de prérempli ; réel 0,00 €, micro 2 265,60 €, amortissement reporté 554,29 €", async ({ page }) => {
  const erreurs = surveillerConsole(page);
  await page.goto("/outils/simulateur-lmnp");
  // Q123 : ce test lisait le résultat des valeurs de départ (DEFAUTS_LMNP). Tout part vide ; l'exemple se saisit.
  await expect(page.getByLabel("Loyers encaissés (recettes)")).toHaveValue("");
  await expect(page.getByLabel("Prix d'achat")).toHaveValue("");
  await expect(page.locator("main").getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(page.getByTestId("lmnp-etat")).toHaveText("À compléter");
  await expect(page.getByTestId("lmnp-impot-reel")).toHaveCount(0);
  await premiereSaisie(page, "Loyers encaissés (recettes)", "9600", "lmnp-manque", "les loyers encaissés");
  await remplir(page, [
    ["Charges déductibles", "3800"],
    ["Prix d'achat", "160000"],
    ["Frais d'acquisition", "14000"],
    ["Part du terrain", "20"],
    ["Durée du bâti", "30"],
    ["Mobilier", "5000"],
    ["Durée du mobilier", "7"],
    ["Travaux", "10000"],
    ["Durée des travaux", "10"],
  ]);
  await page.getByRole("group", { name: "Tranche marginale d'imposition" }).getByRole("radio", { name: /^30\s%$/ }).check();
  await expect(page.getByTestId("lmnp-impot-reel")).toHaveText(/^0,00\s€$/);
  await expect(page.getByTestId("lmnp-impot-micro")).toHaveText(/2\s265,60\s€/);
  await expect(page.getByTestId("lmnp-economie")).toHaveText(/2\s265,60\s€/);
  await expect(page.getByTestId("lmnp-reporte")).toContainText(/554,29\s€/);
  await expect(page.getByText(/meublés de tourisme/)).toBeVisible();
  await verifierPage(page, erreurs);
});

test("rentabilité : rien de prérempli ; brute 5,29 %, nette 4,08 %, cash-flow −350,44 €", async ({ page }) => {
  const erreurs = surveillerConsole(page);
  await page.goto("/outils/rentabilite-locative");
  // Q123 : ce test lisait le résultat de l'exemple prérempli (EXEMPLE_RENTABILITE). Tout part vide ; l'exemple se saisit.
  await expect(page.getByLabel("Prix d'achat")).toHaveValue("");
  await expect(page.getByLabel("Loyer mensuel hors charges")).toHaveValue("");
  await expect(page.locator("main").getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(page.getByTestId("rt-etat")).toHaveText("À compléter");
  await expect(page.getByTestId("rt-brute")).toHaveCount(0);
  await premiereSaisie(page, "Prix d'achat", "150000", "rt-manque", "le prix d'achat");
  await remplir(page, [
    ["Frais d'acquisition", "11000"],
    ["Travaux", "9000"],
    ["Loyer mensuel hors charges", "750"],
    ["Vacance locative", "1"],
    ["Charges non récupérables", "400"],
    ["Taxe foncière", "800"],
    ["Assurance propriétaire non occupant", "120"],
    ["Frais de gestion", "0"],
  ]);
  await expect(page.getByRole("group", { name: "Le financement" })).toBeVisible();
  await page.getByRole("radio", { name: "Calculer la mensualité" }).check();
  // Un crédit choisi ne se calcule pas sur une durée nulle : refusé, plus de « Sans crédit ».
  await remplir(page, [["Montant emprunté", "160000"], ["Taux annuel", "3,5"], ["Durée", "0"]]);
  await expect(page.getByTestId("rt-manque")).toHaveText("Renseignez une durée du crédit d'au moins un mois.");
  await expect(page.getByTestId("rt-etat")).toHaveText("À compléter");
  await remplir(page, [["Durée", "20"]]);
  await expect(page.getByTestId("rt-brute")).toHaveText(/5,29\s%/);
  await expect(page.getByTestId("rt-nette")).toHaveText(/4,08\s%/);
  await expect(page.getByTestId("rt-cashflow")).toHaveText(/-350,44\s€/);
  await verifierPage(page, erreurs);
});

test("quittance publique : aucun document sans paiement valide, excédent hors du terme", async ({ page }) => {
  await page.goto("/outils/quittance-de-loyer");
  await quittancePrete(page);
  // Q123 : la date du paiement et les charges ne sont plus posées d'office.
  await remplir(page, [["Date du paiement", "2026-09-03"], ["Provision pour charges", "120"]]);
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
  // Complet, il s'imprime.
  await page.getByRole("group", { name: "Mode de paiement" }).getByRole("radio", { name: "Virement" }).check();
  await remplir(page, MENTIONS_QUITTANCE);
  await expect(page.getByRole("button", { name: "Imprimer la quittance" })).toBeEnabled();
  await page.emulateMedia({ media: "print" });
  await expect(document).toBeVisible();
});
