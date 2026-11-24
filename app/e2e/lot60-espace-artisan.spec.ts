import { expect, test, type Page } from "@playwright/test";
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// PHASE 3, LOT 60 — ESPACE ARTISAN : CE QUE LES CAPTURES DE LA PASSE 1 MONTRAIENT DE FAUX OU D'INCOHÉRENT.
//
//  1. « Aide en cas de problème » ouvrait la page de panne, qui annonçait un échec de lecture sans rien vérifier ;
//  2. « Nouveau chantier et devis » allumait « Devis » (les demandes reçues par Gerimmo) au lieu de « Clients externes » ;
//  3. à 390 px, l'onglet « Coordonnées » sortait de sa pastille ; l'adresse de l'entreprise ne se lisait pas dans ses coordonnées ;
//  4. l'agenda montrait vides les jours que la fiche de mission demande de garder libres ;
//  5. sans téléphone, « Sur place » promettait un contact ouvert ; sans rendez-vous, l'écran du compte rendu faisait du
//     démarrage son bouton principal, sans mise en garde.
// Les parcours 4 et 5 posent EUX-MÊMES leur mission fictive (acceptée, trois dates proposées au locataire) : ils ne
// dépendent pas de l'état laissé par les autres parcours. Aucun e-mail ; la mission fictive reste en base (rien n'est supprimé).

test.use({ storageState: "e2e/.auth/artisan.json", actionTimeout: 10_000 });

const BASE_LOCALE = /^postgres(?:ql)?:\/\/[^@]*@(?:127\.0\.0\.1|localhost):\d{1,5}\/gerimmo_ci_[a-z_]+_api$/;

async function ouvrirMenu(page: Page) {
  await page.getByRole("button", { name: /^Menu/ }).click();
  const menu = page.getByRole("navigation", { name: "Autres rubriques artisan" });
  await expect(menu).toBeVisible();
  return menu;
}

test("menu du téléphone : l'aide mène à la page d'aide, et le point de « Menu » se retrouve sur « Mes attestations »", async ({ page }) => {
  await sansSyntheseAlertes(page);
  await page.goto("/artisan");
  const bouton = page.getByRole("button", { name: /^Menu/ });
  await expect(bouton).toBeVisible();
  const signale = (await bouton.locator(".sr-only").count()) > 0;
  const menu = await ouvrirMenu(page);
  // Le signal posé sur « Menu » désigne une entrée, et une seule ; sans signal, aucune entrée n'en porte.
  await expect(menu.locator("[data-point-attestations]")).toHaveCount(signale ? 1 : 0);
  if (signale) await expect(menu.getByRole("link", { name: /Mes attestations/ }).locator("[data-point-attestations]")).toHaveCount(1);
  await expect(menu.getByRole("link", { name: "Ma fiche entreprise", exact: true })).toBeVisible();
  const aide = menu.getByRole("link", { name: "Aide en cas de problème", exact: true });
  expect(await aide.getAttribute("href")).toMatch(/^\/assistance\?/);
  await aide.click();
  await page.waitForURL(/\/assistance\?/);
  await expect(page.locator("body")).not.toContainText("Lecture momentanément impossible");
  await expect(page.locator("body")).not.toContainText("n’a pas pu être lue");
  await expect(page.locator("h1")).toHaveCount(1);
});

test("la page de panne, ouverte alors que la fiche se lit, ramène à l'espace au lieu d'annoncer un échec", async ({ page }) => {
  await sansSyntheseAlertes(page);
  await page.goto("/artisan/panne");
  await expect(page).toHaveURL((url) => url.pathname === "/artisan");
  await expect(page.locator("body")).not.toContainText("Lecture momentanément impossible");
});

test("« Nouveau chantier et devis » : rubrique « Clients externes », au téléphone comme sur ordinateur", async ({ page, browser }) => {
  await sansSyntheseAlertes(page);
  await page.goto("/artisan/devis/nouveau");
  await expect(page.getByRole("heading", { level: 1, name: "Nouveau chantier et devis" })).toBeVisible();
  // Barre du bas : « Devis » (demandes reçues par Gerimmo) n'est plus allumé ici.
  // (Le gabarit rend les deux présentations ; au téléphone, seule la barre du bas — `.artisan-navigation` — est affichée.)
  const barre = page.locator('nav.artisan-navigation[aria-label="Mon espace artisan"]');
  await expect(barre).toBeVisible();
  await expect(barre.locator('a[aria-current="page"]')).toHaveCount(0);
  // Les pastilles : celle de la page affichée est signalée ; « Agenda » et « Facturation » ne répètent plus la barre du bas.
  const pastilles = page.getByRole("navigation", { name: "Clients externes et règlements" });
  await expect(pastilles.locator('a[aria-current="page"]')).toHaveText("Nouveau chantier et devis");
  await expect(pastilles.getByRole("link", { name: "Agenda", exact: true })).toHaveCount(0);
  await expect(pastilles.getByRole("link", { name: "Facturation", exact: true })).toHaveCount(0);
  await expect(pastilles.getByRole("link", { name: "Exporter toutes mes données (fichier JSON)", exact: true })).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
  // Le menu ouvert marque « Clients externes ».
  const menu = await ouvrirMenu(page);
  await expect(menu.locator('a[aria-current="page"]')).toHaveText("Clients externes");

  // Sur ordinateur : le menu latéral allume « Clients externes », pas « Demandes de devis ».
  const bureau = await browser.newContext({ storageState: "e2e/.auth/artisan.json", viewport: { width: 1440, height: 1000 }, locale: "fr-FR", timezoneId: "Europe/Paris" });
  try {
    const grand = await bureau.newPage();
    await sansSyntheseAlertes(grand);
    await grand.goto("/artisan/devis/nouveau");
    const lateral = grand.locator('nav[aria-label="Mon espace artisan"]:not(.artisan-navigation)');
    await expect(lateral).toBeVisible();
    await expect(lateral.locator('a[aria-current="page"]')).toHaveText(/^Clients externes/);
    await expect(lateral.locator('a[aria-current="page"]')).toHaveCount(1);
    // Une vraie demande reçue allume toujours « Demandes de devis ».
    await grand.goto("/artisan/devis");
    await expect(lateral.locator('a[aria-current="page"]')).toHaveText(/^Demandes de devis/);
    // La pastille de la page affichée, sur la liste des clients (masquée ici : le menu latéral la porte).
    await grand.goto("/artisan/clients");
    await expect(lateral.locator('a[aria-current="page"]')).toHaveText(/^Clients externes/);
  } finally {
    await bureau.close();
  }
});

test("« Ma fiche entreprise » à 390 px : aucun onglet ne déborde de sa pastille, et l'adresse se lit dans les coordonnées", async ({ page }) => {
  await sansSyntheseAlertes(page);
  await page.goto("/artisan/entreprise");
  await expect(page.getByRole("heading", { level: 1, name: "Ma fiche entreprise" })).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  const onglets = page.getByRole("tab");
  await expect(onglets).toHaveCount(4);
  // Le texte de chaque onglet tient dans sa pastille (le contrôle automatique de la passe 1 ne le voyait pas).
  const debords = await onglets.evaluateAll((boutons) => boutons.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => `${b.textContent} : ${b.scrollWidth} > ${b.clientWidth}`));
  expect(debords).toEqual([]);
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
  // L'adresse imprimée sur les devis se lit avec le SIRET, le téléphone et l'e-mail ; son lien ouvre l'onglet où elle se saisit.
  const adresse = page.locator("[data-adresse-entreprise]");
  await expect(adresse).toBeVisible();
  await expect(adresse).toContainText("Adresse de l’entreprise");
  await adresse.getByRole("link").click();
  await expect(page.getByRole("tab", { name: "Mes devis", exact: true })).toHaveAttribute("aria-selected", "true");
});

test("mission acceptée, trois dates proposées : l'agenda les montre, « Sur place » et le compte rendu disent vrai", async ({ page }) => {
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !BASE_LOCALE.test(cible), "Base API fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const incident = randomUUID(), mission = randomUUID();
  // Trois matins de suite, à 6 h (heure d'hiver) ou 7 h (heure d'été) de Paris : une heure qu'aucun autre parcours ne prend.
  const jours = [2, 3, 4].map((j) => new Date(Date.now() + j * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }));
  try {
    const { rows: [a] } = await db.query("select a.id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'");
    const { rows: [lot] } = await db.query("select i.organization_id,i.lot_id from incidents i join organizations o on o.id=i.organization_id where o.name='Agence Alpha' and i.id in (select incident_id from incident_interventions where artisan_id=$1) order by i.id limit 1", [a.id]);
    await db.query("insert into incidents(id,organization_id,lot_id,numero,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,$3,$4,'agence','plomberie_canalisation','ESSAI lot 60 : dates à garder libres','affecte','proprietaire','ESSAI : réparation fictive à la charge du propriétaire')", [incident, lot.organization_id, lot.lot_id, `L60-${incident.slice(0, 8)}`]);
    await db.query("insert into incident_interventions(id,organization_id,incident_id,artisan_id,nature_travaux,statut,acceptee_le) values($1,$2,$3,$4,'entretien_courant','acceptee',now())", [mission, lot.organization_id, incident, a.id]);
    for (const jour of jours) {
      await db.query("insert into intervention_creneaux(organization_id,intervention_id,propose_par,tour,debut,fin,statut) values($1,$2,'artisan',1,$3,$4,'propose')", [lot.organization_id, mission, `${jour}T05:00:00Z`, `${jour}T06:00:00Z`]);
    }
  } finally {
    await db.end();
  }
  await sansSyntheseAlertes(page);

  // ── La fiche de mission : les dates à garder libres, telles qu'elle les écrit.
  await page.goto(`/artisan/missions/${mission}`);
  const surFiche = await page.getByText("Gardez-les libres", { exact: false }).locator("xpath=following-sibling::ul[1]/li").allInnerTexts();
  expect(surFiche).toHaveLength(3);

  // « Sur place » : la phrase du contact ouvert ne s'écrit qu'avec un numéro à appeler.
  const surPlace = page.locator("[data-contact-occupant]");
  if (await surPlace.count()) {
    const appeler = await page.getByRole("link", { name: /^Appeler / }).count();
    await expect(surPlace).toHaveAttribute("data-contact-occupant", appeler ? "telephone" : "nom-seul");
    if (appeler) await expect(surPlace).toContainText("Ce contact vous est ouvert le temps de la mission");
    else {
      await expect(surPlace).not.toContainText("Ce contact vous est ouvert");
      await expect(surPlace).toContainText("Aucun numéro de téléphone n’a été communiqué");
    }
  }

  // ── L'agenda : la carte de la mission écrit les mêmes dates ; la bande marque ces trois jours.
  await page.goto("/artisan/agenda");
  const carte = page.locator(`a[href="/artisan/missions/${mission}"]`);
  await expect(carte).toContainText("3 dates au choix du locataire");
  expect(await carte.locator("[data-dates-a-garder] li").allInnerTexts()).toEqual(surFiche);
  for (const jour of jours) await expect(page.locator(`[data-jour-a-garder="${jour}"]`)).toHaveCount(1);
  await expect(page.locator(`[data-jour-a-garder="${jours[0]}"]`)).toContainText("à garder libre");
  await expect(page.locator("[data-legende-a-garder]")).toContainText("à garder libre jusqu'à sa réponse");
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);

  // ── Le compte rendu, ouvert sans rendez-vous fixé : démarrer n'est plus le bouton principal, et la mise en garde est là.
  await page.goto(`/artisan/missions/${mission}/compte-rendu`);
  const demarrer = page.getByRole("button", { name: "Je démarre l'intervention", exact: true });
  await expect(demarrer).toBeVisible();
  const revenir = page.getByRole("link", { name: "Revenir à la mission", exact: true });
  // Même dessin sobre que « Revenir à la mission » (sur le code d'avant : le bouton plein de l'action principale).
  expect(await demarrer.getAttribute("class")).toBe(await revenir.getAttribute("class"));
  await expect(page.locator("[data-mise-en-garde-sans-rendez-vous]")).toContainText("démarrer sans rendez-vous n'a de sens que pour un dépannage sans attendre");
});
