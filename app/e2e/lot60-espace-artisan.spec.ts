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
// Les parcours de mission posent EUX-MÊMES leur mission fictive (acceptée, dates proposées au locataire) : ils ne
// dépendent pas de l'état laissé par les autres parcours. Aucun e-mail ; les missions fictives restent en base.
//
// REPRISES DU LOT 60 (relecture L60R) :
//  R1 libellé de l'export ; R2 « Sur place » dit qui lit la discussion, et seulement si elle est ouverte ; R3 onglets de
//  421 à 470 px ; R6 l'agenda écrit le nombre de dates qu'il liste ; R7 l'aide porte la page d'où l'on vient ; R8 une seule
//  mise en garde au compte rendu.
//  R4, R5 : chaque défaut a désormais SON parcours, sans condition : la carte « Sur place » est posée avec un bail (elle
//  n'existait pas dans l'ancien parcours, dont le bloc ne s'exécutait jamais), et l'échec d'une assertion ne masque plus
//  les suivantes (un parcours par défaut).

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
  // Reprise du lot 60 (R1) : le libellé ne promet plus « toutes mes données » ; il dit ce que le fichier ne contient pas.
  await expect(pastilles.getByRole("link", { name: "Exporter mon activité (fichier JSON, sans les discussions ni les pièces jointes)", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Exporter toutes mes données/ })).toHaveCount(0);
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

// Reprise du lot 60 (R7) : l'adresse de l'aide était figée sur l'accueil ; ouverte depuis une autre page, la demande
// partait avec l'écran « /artisan » et « Retour à ma page » ne ramenait pas d'où l'on venait.
test("menu du téléphone : l'aide ouverte depuis « Ma fiche entreprise » porte cette page, et y ramène", async ({ page }) => {
  await sansSyntheseAlertes(page);
  await page.goto("/artisan/entreprise");
  const menu = await ouvrirMenu(page);
  const aide = menu.getByRole("link", { name: "Aide en cas de problème", exact: true });
  const href = (await aide.getAttribute("href")) ?? "";
  expect(href).toContain("ecran=%2Fartisan%2Fentreprise");
  expect(href).toContain("retour=%2Fartisan%2Fentreprise");
  await aide.click();
  await page.waitForURL(/\/assistance\?/);
  await page.getByRole("link", { name: "Retour à ma page" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/artisan/entreprise");
});

test("« Ma fiche entreprise » : un seul titre, du même nom que dans les menus", async ({ page }) => {
  await sansSyntheseAlertes(page);
  await page.goto("/artisan/entreprise");
  await expect(page.getByRole("heading", { level: 1, name: "Ma fiche entreprise" })).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
});

/** Les onglets dont le texte sort de la pastille, à la largeur de la page. */
async function ongletsQuiDebordent(page: Page): Promise<string[]> {
  const onglets = page.getByRole("tab");
  await expect(onglets).toHaveCount(4);
  return onglets.evaluateAll((boutons) => boutons.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => `${b.textContent} : ${b.scrollWidth} > ${b.clientWidth}`));
}

test("« Ma fiche entreprise » à 390 px : aucun onglet ne déborde de sa pastille", async ({ page }) => {
  await sansSyntheseAlertes(page);
  await page.goto("/artisan/entreprise");
  // Le texte de chaque onglet tient dans sa pastille (le contrôle automatique de la passe 1 ne le voyait pas).
  expect(await ongletsQuiDebordent(page)).toEqual([]);
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
});

// Reprise du lot 60 (R3) : la largeur minimale d'un onglet ne valait que jusqu'à 420 px. De 421 à 470 px environ, la police
// repassait à 14 px et « Coordonnées », « Disponibilités » sortaient de nouveau de leur pastille.
for (const largeur of [421, 430, 445, 460, 470]) {
  test(`« Ma fiche entreprise » à ${largeur} px : aucun onglet ne déborde de sa pastille`, async ({ browser }) => {
    const contexte = await browser.newContext({ storageState: "e2e/.auth/artisan.json", viewport: { width: largeur, height: 900 }, locale: "fr-FR", timezoneId: "Europe/Paris" });
    try {
      const page = await contexte.newPage();
      await sansSyntheseAlertes(page);
      await page.goto("/artisan/entreprise");
      expect(await ongletsQuiDebordent(page)).toEqual([]);
      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    } finally {
      await contexte.close();
    }
  });
}

test("« Ma fiche entreprise » : l'adresse se lit dans les coordonnées, et son lien ouvre l'onglet où elle se saisit", async ({ page }) => {
  await sansSyntheseAlertes(page);
  await page.goto("/artisan/entreprise");
  // L'adresse imprimée sur les devis se lit avec le SIRET, le téléphone et l'e-mail ; son lien ouvre l'onglet où elle se saisit.
  const adresse = page.locator("[data-adresse-entreprise]");
  await expect(adresse).toBeVisible();
  await expect(adresse).toContainText("Adresse de l’entreprise");
  await adresse.getByRole("link").click();
  await expect(page.getByRole("tab", { name: "Mes devis", exact: true })).toHaveAttribute("aria-selected", "true");
});

// ── Les parcours de mission ──────────────────────────────────────────────────────────────────────────────────────────

/** À 6 h (heure d'hiver) ou 7 h (heure d'été) de Paris, `j` jours après aujourd'hui : une heure qu'aucun autre parcours ne prend. */
const jourParis = (j: number) => new Date(Date.now() + j * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });

function baseLocale(): string {
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible || !BASE_LOCALE.test(cible), "Base API fictive locale requise");
  return cible!;
}

/**
 * Pose une mission acceptée de l'artisan du jeu d'essai, avec des dates proposées au locataire (`jours` : décalages en
 * jours, négatifs pour une date passée). `avecBail` rattache l'incident au bail du lot : la mission a alors un occupant,
 * donc une carte « Sur place » (reprise R4 : sans bail, la carte n'existait pas et son contrôle ne s'exécutait jamais).
 */
async function poserMission(db: Client, { jours, avecBail = false }: { jours: number[]; avecBail?: boolean }) {
  const incident = randomUUID(), mission = randomUUID();
  const { rows: [a] } = await db.query("select a.id from artisans a join auth.users u on u.id=a.account_id where u.email='artisan.alpha@example.com'");
  const { rows: [lot] } = await db.query("select i.organization_id,i.lot_id,i.bail_id,b.locataire_principal from incidents i join organizations o on o.id=i.organization_id left join baux b on b.id=i.bail_id where o.name='Agence Alpha' and i.id in (select incident_id from incident_interventions where artisan_id=$1) order by (i.bail_id is null), i.id limit 1", [a.id]);
  if (avecBail) expect(lot.bail_id, "le jeu d'essai porte un incident rattaché à un bail").toBeTruthy();
  await db.query("insert into incidents(id,organization_id,lot_id,bail_id,numero,canal,categorie,description,etat,imputation,imputation_justification) values($1,$2,$3,$4,$5,'agence','plomberie_canalisation','ESSAI lot 60 : dates à garder libres','affecte','proprietaire','ESSAI : réparation fictive à la charge du propriétaire')", [incident, lot.organization_id, lot.lot_id, avecBail ? lot.bail_id : null, `L60-${incident.slice(0, 8)}`]);
  await db.query("insert into incident_interventions(id,organization_id,incident_id,artisan_id,nature_travaux,statut,acceptee_le) values($1,$2,$3,$4,'entretien_courant','acceptee',now())", [mission, lot.organization_id, incident, a.id]);
  for (const j of jours) {
    await db.query("insert into intervention_creneaux(organization_id,intervention_id,propose_par,tour,debut,fin,statut) values($1,$2,'artisan',1,$3,$4,'propose')", [lot.organization_id, mission, `${jourParis(j)}T05:00:00Z`, `${jourParis(j)}T06:00:00Z`]);
  }
  return { mission, occupant: lot.locataire_principal as string | null };
}

test("mission acceptée, trois dates proposées : l'agenda écrit les dates de la fiche et marque ces jours", async ({ page }) => {
  const db = new Client({ connectionString: baseLocale() });
  await db.connect();
  // Trois matins de suite (2, 3 et 4 jours après aujourd'hui).
  const jours = [2, 3, 4].map(jourParis);
  let mission: string;
  try { ({ mission } = await poserMission(db, { jours: [2, 3, 4] })); } finally { await db.end(); }
  await sansSyntheseAlertes(page);

  // ── La fiche de mission : les dates à garder libres, telles qu'elle les écrit.
  await page.goto(`/artisan/missions/${mission}`);
  const surFiche = await page.getByText("Gardez-les libres", { exact: false }).locator("xpath=following-sibling::ul[1]/li").allInnerTexts();
  expect(surFiche).toHaveLength(3);

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
});

// Reprise du lot 60 (R6) : le compteur de l'agenda compte toutes les dates sans réponse, passées comprises ; la liste ne rend
// que celles qui peuvent encore être retenues. La carte écrivait « 3 dates au choix du locataire » au-dessus de 2 dates, ou
// sans aucune alors que la fiche dit « Proposez de nouvelles dates ».
test("agenda : une date proposée déjà passée n'est plus comptée ; toutes passées, la carte demande d'en proposer de nouvelles", async ({ page }) => {
  const db = new Client({ connectionString: baseLocale() });
  await db.connect();
  let unePassee: string, toutesPassees: string;
  try {
    ({ mission: unePassee } = await poserMission(db, { jours: [-2, 5, 6] }));
    ({ mission: toutesPassees } = await poserMission(db, { jours: [-4, -3, -2] }));
  } finally { await db.end(); }
  await sansSyntheseAlertes(page);
  await page.goto("/artisan/agenda");

  const carte = page.locator(`a[href="/artisan/missions/${unePassee}"]`);
  await expect(carte).toContainText("2 dates au choix du locataire");
  await expect(carte).not.toContainText("3 dates");
  await expect(carte.locator("[data-dates-a-garder] li")).toHaveCount(2);

  const perimee = page.locator(`a[href="/artisan/missions/${toutesPassees}"]`);
  await expect(perimee).toContainText("Plus aucune date proposée n’est disponible : proposez-en de nouvelles");
  await expect(perimee).not.toContainText("au choix du locataire");
  await expect(perimee).not.toContainText("En attente du locataire");
  await expect(perimee.locator("[data-dates-a-garder]")).toHaveCount(0);
  // La fiche de cette mission dit la même chose.
  await page.goto(`/artisan/missions/${toutesPassees}`);
  await expect(page.getByText("Proposez de nouvelles dates", { exact: true })).toBeVisible();
});

// E005, reprises R2 et R4. La carte « Sur place » d'une mission rattachée à un bail, dans ses trois états : sans numéro et
// discussion ouverte ; sans numéro et discussion fermée ; avec un numéro. Le téléphone de l'occupant fictif est posé par le
// parcours et remis tel qu'il était à la fin.
test("« Sur place » : sans numéro, la carte dit qui lit la discussion — et n'y renvoie pas quand elle est fermée", async ({ page }) => {
  const db = new Client({ connectionString: baseLocale() });
  await db.connect();
  let occupant: string | null = null, telephoneInitial: string | null = null;
  try {
    const posee = await poserMission(db, { jours: [7, 8, 9], avecBail: true });
    const mission = posee.mission;
    occupant = posee.occupant;
    expect(occupant, "le bail du jeu d'essai a un locataire principal").toBeTruthy();
    telephoneInitial = (await db.query("select telephone from persons where id=$1", [occupant])).rows[0].telephone;
    await db.query("update persons set telephone=null where id=$1", [occupant]);
    await sansSyntheseAlertes(page);
    const surPlace = page.locator("[data-contact-occupant]");

    // 1. Sans numéro, discussion ouverte.
    await page.goto(`/artisan/missions/${mission}`);
    await expect(page.getByRole("heading", { name: "Sur place", exact: true })).toBeVisible();
    await expect(surPlace).toHaveCount(1);
    await expect(surPlace).toHaveAttribute("data-contact-occupant", "nom-seul");
    await expect(page.getByRole("link", { name: /^Appeler / })).toHaveCount(0);
    await expect(surPlace).not.toContainText("Ce contact vous est ouvert");
    await expect(surPlace).toContainText("Aucun numéro de téléphone n’a été communiqué pour cette personne.");
    await expect(surPlace).toContainText("écrivez dans la discussion de l’intervention, plus bas : votre client la lit, et le locataire aussi s’il a un compte Gerimmo.");
    // La discussion annoncée « plus bas » est bien là, ouverte.
    const discussion = page.getByRole("region", { name: "Discussion de l’intervention" });
    await expect(discussion).toBeVisible();
    await expect(discussion.locator("header")).not.toContainText("Fermée");

    // 2. Sans numéro, discussion fermée par le gestionnaire : plus de renvoi à la discussion.
    await db.query("insert into intervention_echanges_etat(intervention_id,fermee_le) values($1,now()) on conflict (intervention_id) do update set fermee_le=now()", [mission]);
    await page.reload();
    await expect(discussion.locator("header")).toContainText("Fermée");
    await expect(surPlace).toHaveAttribute("data-contact-occupant", "nom-seul");
    await expect(surPlace).toHaveText("Aucun numéro de téléphone n’a été communiqué pour cette personne. Son nom vous est donné le temps de la mission.");
    await expect(surPlace).not.toContainText("discussion");

    // 3. Avec un numéro : le contact ouvert, et le bouton d'appel.
    await db.query("update persons set telephone='06 00 00 00 01' where id=$1", [occupant]);
    await page.reload();
    await expect(surPlace).toHaveAttribute("data-contact-occupant", "telephone");
    await expect(page.getByRole("link", { name: "Appeler 06 00 00 00 01", exact: true })).toBeVisible();
    await expect(surPlace).toHaveText("Ce contact vous est ouvert le temps de la mission, et refermé à la fin.");
  } finally {
    if (occupant) await db.query("update persons set telephone=$2 where id=$1", [occupant, telephoneInitial]);
    await db.end();
  }
});

// E119, reprise R8.
test("compte rendu ouvert sans rendez-vous fixé : démarrer n'est pas le bouton principal, et une seule mise en garde le dit", async ({ page }) => {
  const db = new Client({ connectionString: baseLocale() });
  await db.connect();
  let mission: string;
  try { ({ mission } = await poserMission(db, { jours: [10, 11, 12] })); } finally { await db.end(); }
  await sansSyntheseAlertes(page);
  await page.goto(`/artisan/missions/${mission}/compte-rendu`);
  const demarrer = page.getByRole("button", { name: "Je démarre l'intervention", exact: true });
  await expect(demarrer).toBeVisible();
  const revenir = page.getByRole("link", { name: "Revenir à la mission", exact: true });
  // Même dessin sobre que « Revenir à la mission » (sur le code d'avant : le bouton plein de l'action principale).
  expect(await demarrer.getAttribute("class")).toBe(await revenir.getAttribute("class"));
  await expect(page.locator("[data-mise-en-garde-sans-rendez-vous]")).toContainText("démarrer sans rendez-vous n'a de sens que pour un dépannage sans attendre");
  // Reprise R8 : le bouton ajoutait sa propre phrase juste au-dessus — deux mises en garde pour une seule idée.
  await expect(page.locator("main")).not.toContainText("Si vous intervenez sans attendre le rendez-vous.");
  await expect(page.getByText(/sans attendre/)).toHaveCount(1);
});
