import { expect, test, type Browser, type Page } from "@playwright/test";
import { Client } from "pg";
import { connecterVers, debordementHorizontal, entrerDansEspace } from "./aides";
import {
  appelerTermeNonEchu, creerColocataireEtDemande, creerEspaceLot61, creerLocataireLot61, reglerAdresseEspaceLot61,
} from "./local/lot61-locataires";

// PHASE 3, LOT 61 — ESPACE DU LOCATAIRE : TROIS ÉCRANS QUI SE CONTREDISAIENT.
//
// Relevés sur les captures de la passe 1, avec le locataire fictif de l'agence fictive (données du jeu de parcours) :
//  1. « Mes demandes » rendait la « Discussion de l'intervention » après toutes les demandes, sans la nommer : avec
//     deux demandes, elle se lisait sous la mauvaise ;
//  2. « Mes paiements » promettait « quittance établie et disponible ici — rien à demander » à côté d'un reçu marqué
//     « Document en préparation » ;
//  3. /compte dit d'écrire au gestionnaire pour les données de la location ; /compte/donnees, où mène son bouton, ne le
//     disait pas, et n'avait ni retour à « Mon espace » ni « Se déconnecter ».
// Les trois premiers parcours lisent le jeu commun (lecture seule).
//
// REPRISE DU LOT 61 (relecture de 4405265a). Le contrôle de « Mes paiements » était sous `if (await phrase.count())` :
// selon l'état laissé par les autres parcours, il pouvait ne rien vérifier (M6). Les parcours « reprise » posent
// EUX-MÊMES leur état (e2e/local/lot61-locataires.ts : un espace fictif neuf par cas) et vérifient chaque branche sans
// condition. Aucun e-mail, aucun paiement réel ; les espaces fictifs restent en base (marque unique), rien n'est supprimé.

test.use({ storageState: "e2e/.auth/locataire.json", actionTimeout: 10_000 });

test("Mes demandes : chaque discussion d'intervention est sous sa demande et la nomme", async ({ page }) => {
  const base = `/locataire/${await entrerDansEspace(page, "locataire")}`;
  await page.goto(`${base}/demandes`);
  await expect(page.getByRole("heading", { level: 1, name: "Mes demandes" })).toBeVisible();
  const discussions = page.locator('section[id^="discussion-"]');
  // Le jeu de parcours donne au locataire une demande avec artisan retenu : au moins une discussion.
  await expect(discussions.first()).toBeVisible();
  const nombre = await discussions.count();
  for (let i = 0; i < nombre; i++) {
    const discussion = discussions.nth(i);
    // La discussion est dans le bloc de SA demande, juste après la carte…
    const bloc = discussion.locator("xpath=ancestor::div[@data-demande-et-discussion][1]");
    await expect(bloc).toHaveCount(1);
    const carte = bloc.locator(':scope > div[id^="demande-"]');
    await expect(carte).toHaveCount(1);
    expect(await carte.getAttribute("id")).toBe(`demande-${await bloc.getAttribute("data-demande-et-discussion")}`);
    // … et elle nomme cette demande : sa catégorie, telle que la carte l'affiche en titre.
    const titre = (await carte.getByRole("heading", { level: 2 }).first().innerText()).trim();
    await expect(discussion.locator("[data-demande-concernee]")).toContainText(`Pour votre demande : ${titre}`);
    // Dans la page, rien ne s'intercale entre la carte et sa discussion.
    const ordre = await bloc.evaluate((el) => Array.from(el.children).map((c) => c.id.split("-")[0]));
    expect(ordre[0]).toBe("demande");
    expect(ordre.slice(1).every((nom) => nom === "discussion")).toBe(true);
  }
  // Plus aucune discussion laissée en bas de page, hors de toute demande.
  await expect(page.locator('section[id^="discussion-"]:not([data-demande-et-discussion] section)')).toHaveCount(0);
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
});

test("Mes paiements et FAQ (jeu commun) : l'écran s'affiche, la FAQ dit la réserve", async ({ page }) => {
  const base = `/locataire/${await entrerDansEspace(page, "locataire")}`;
  await page.goto(`${base}/loyers`);
  await expect(page.getByRole("heading", { level: 1, name: "Mes paiements" })).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
  // Reprise (M6) : la phrase de quittance n'existe ici que s'il reste un loyer à régler, ce qui dépend des autres
  // parcours ; son contrôle, qui pouvait ne rien vérifier, a quitté ce parcours. Les deux phrases sont vérifiées plus
  // bas (« reprise M2/M6 »), sur un état que le parcours pose lui-même.
  // La FAQ dit la même réserve.
  await page.goto(`${base}/faq`);
  await page.getByText("Quand vais-je recevoir ma quittance ?").click();
  await expect(page.getByText("Si le document reste marqué « en préparation »")).toBeVisible();
});

test("/compte/donnees : même renvoi vers le gestionnaire que /compte, même bandeau", async ({ page }) => {
  const base = `/locataire/${await entrerDansEspace(page, "locataire")}`;
  await page.goto("/compte");
  const phraseCompte = "Pour tout ce qui concerne votre location, écrivez à votre gestionnaire depuis Mon gestionnaire : c'est lui qui y répond, sous un mois.";
  await expect(page.locator("#donnees-personnelles")).toContainText(phraseCompte);
  await page.getByRole("link", { name: "Gérer mes données et demander la fermeture de mon compte" }).click();
  await expect(page).toHaveURL(/\/compte\/donnees$/);
  await expect(page.getByRole("heading", { level: 1, name: "Mes données personnelles" })).toBeVisible();
  // La même phrase, avant le formulaire, avec le lien vers « Mon gestionnaire ».
  const renvoi = page.locator("[data-renvoi-location]");
  await expect(renvoi).toContainText(phraseCompte);
  await expect(renvoi.getByRole("link", { name: "Mon gestionnaire" })).toHaveAttribute("href", `${base}/contact`);
  const formulaire = page.locator("form[data-saisie-confirmee]");
  expect(await renvoi.evaluate((r, f) => Boolean(r.compareDocumentPosition(f as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await formulaire.elementHandle())).toBe(true);
  await expect(page.getByRole("heading", { level: 2, name: "Mes demandes sur mes données" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lire la politique de confidentialité" })).toHaveAttribute("href", "/confidentialite");
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
  // Le bandeau : la déconnexion est là, et « ← Mon espace » ramène à l'espace sans repasser par /compte.
  await expect(page.locator("header.bandeau-appli").getByRole("button", { name: "Se déconnecter" })).toBeVisible();
  await page.locator("header.bandeau-appli").getByRole("link", { name: "← Mon espace" }).click();
  await expect(page).toHaveURL(new RegExp(`${base}$`));
});

test("l'ancienne adresse des règles ramène le locataire dans son espace", async ({ page }) => {
  const base = `/locataire/${await entrerDansEspace(page, "locataire")}`;
  await page.goto("/veille?public=locataire");
  await expect(page).toHaveURL(new RegExp(`${base}/regles$`));
  await expect(page.getByRole("heading", { level: 1, name: "Les règles à connaître" })).toBeVisible();
});

// ─── REPRISE : des parcours qui posent leur état ─────────────────────────────────────────────────────────────────────

/** Une session neuve pour un compte fictif créé par le parcours (jamais la session du locataire du jeu commun). */
async function ouvrir(browser: Browser, page: Page, qui: { email: string; mot: string }, destination: string) {
  const contexte = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: page.viewportSize() });
  const ecran = await contexte.newPage();
  await connecterVers(ecran, qui.email, qui.mot, destination);
  return ecran;
}
async function base() {
  // `creerEspaceLot61` refuse toute base qui n'est pas la base fictive locale : le parcours échoue, il ne se saute pas.
  const db = new Client({ connectionString: process.env.SUPALOCAL_DB });
  await db.connect();
  return db;
}

for (const type of ["agence", "proprietaire_direct"] as const) {
  const qui = type === "agence" ? "gestionnaire" : "bailleur";
  test(`reprise M2/M6 — nouveau locataire sans aucun reçu (${type}) : profil de l'émetteur incomplet puis complété, les deux phrases`, async ({ page, browser }) => {
    test.setTimeout(120_000);
    const db = await base();
    try {
      // État posé : un espace SANS adresse, un locataire entré il y a trois mois, un terme appelé et pas encore payé.
      const espace = await creerEspaceLot61(db, type, false);
      const locataire = await creerLocataireLot61(db, espace, "actif");
      await appelerTermeNonEchu(db, espace, locataire.bail, 0);
      const loyers = `/locataire/${espace.org}/loyers`;
      const ecran = await ouvrir(browser, page, locataire, loyers);
      await expect(ecran.getByRole("heading", { level: 1, name: "Mes paiements" })).toBeVisible();
      const phrase = ecran.locator("[data-phrase-quittance]");

      // Branche 1 : aucun document dans l'historique, mais l'émetteur ne peut pas délivrer de quittance.
      await expect(ecran.getByText("Document en préparation")).toHaveCount(0);
      await expect(phrase).toHaveCount(1);
      await expect(phrase).toHaveAttribute("data-phrase-quittance", "en-preparation");
      await expect(phrase).toContainText(`votre quittance sera disponible ici dès que votre ${qui} aura complété les informations obligatoires du document`);
      await expect(phrase).not.toContainText("rien à demander");
      await expect(phrase.getByRole("link", { name: `écrire à mon ${qui}` })).toHaveAttribute("href", `/locataire/${espace.org}/contact`);
      await expect(ecran.locator("h1")).toHaveCount(1);
      expect(await debordementHorizontal(ecran)).toBeLessThanOrEqual(1);

      // Branche 2 : l'émetteur complète son profil ; le même locataire relit l'écran.
      await reglerAdresseEspaceLot61(db, espace.org, true);
      await ecran.goto(loyers);
      await expect(phrase).toHaveCount(1);
      await expect(phrase).toHaveAttribute("data-phrase-quittance", "disponible");
      await expect(phrase).toHaveText(/Après paiement intégral, votre quittance est établie et disponible ici — rien à demander\./);
      await expect(phrase).not.toContainText("aura complété les informations obligatoires");
      await ecran.context().close();
    } finally {
      await db.end();
    }
  });
}

test("reprise M1 — ancien locataire (bail terminé, adhésion inactive) : /compte/donnees redit le renvoi de /compte", async ({ page, browser }) => {
  const db = await base();
  try {
    const espace = await creerEspaceLot61(db, "agence", true);
    const ancien = await creerLocataireLot61(db, espace, "termine");
    const ecran = await ouvrir(browser, page, ancien, "/compte");
    const generique = "Pour les données d'une location, adressez-vous à son bailleur ou à son gestionnaire";
    await expect(ecran.locator("#donnees-personnelles")).toContainText(generique);
    await ecran.getByRole("link", { name: "Gérer mes données et demander la fermeture de mon compte" }).click();
    await expect(ecran).toHaveURL(/\/compte\/donnees$/);
    await expect(ecran.getByRole("heading", { level: 1, name: "Mes données personnelles" })).toBeVisible();
    // Avant la reprise : aucune carte de renvoi pour lui. Elle est là, avant le formulaire.
    const renvoi = ecran.locator("[data-renvoi-location]");
    await expect(renvoi).toHaveCount(1);
    await expect(renvoi).toContainText(generique);
    await expect(renvoi).toContainText("Le formulaire ci-dessous ne lui est pas transmis");
    const formulaire = ecran.locator("form[data-saisie-confirmee]");
    expect(await renvoi.evaluate((r, f) => Boolean(r.compareDocumentPosition(f as Node) & Node.DOCUMENT_POSITION_FOLLOWING), await formulaire.elementHandle())).toBe(true);
    await expect(ecran.getByRole("heading", { level: 2, name: "Faire une demande sur mon compte" })).toBeVisible();
    // M4 : au doigt (ce parcours tourne au gabarit téléphone, tactile), le lien de confidentialité fait 44 px de haut.
    const lien = ecran.getByRole("link", { name: "Lire la politique de confidentialité" });
    expect((await lien.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(ecran.locator("h1")).toHaveCount(1);
    expect(await debordementHorizontal(ecran)).toBeLessThanOrEqual(1);
    await ecran.context().close();
  } finally {
    await db.end();
  }
});

test("reprise M3/M5 — terme pas encore échu payé en partie ; le colocataire non déclarant lit « Pour la demande »", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const db = await base();
  try {
    const espace = await creerEspaceLot61(db, "proprietaire_direct", true);
    const principal = await creerLocataireLot61(db, espace, "actif");
    // 640 € appelés pour une échéance dans trois jours, 200 € déjà versés : 440 € restent, et rien n'est « échu ».
    await appelerTermeNonEchu(db, espace, principal.bail, 200);
    const colocataire = await creerColocataireEtDemande(db, espace, principal);
    const { rows: [terme] } = await db.query("select statut, date_echeance > public.aujourdhui_paris() as non_echu from public.etat_loyers_bail_brut($1)", [principal.bail]);
    expect(terme).toEqual({ statut: "partiel", non_echu: true });

    const chezLePrincipal = await ouvrir(browser, page, principal, `/locataire/${espace.org}/loyers`);
    await expect(chezLePrincipal.getByRole("heading", { level: 1, name: "Mes paiements" })).toBeVisible();
    await expect(chezLePrincipal.getByText(/Il reste 440,00\s€ à régler sur vos loyers et charges appelés\./)).toBeVisible();
    await expect(chezLePrincipal.getByText("loyers échus")).toHaveCount(0);
    // Témoin : le déclarant lit « Pour votre demande ».
    await chezLePrincipal.goto(`/locataire/${espace.org}/demandes`);
    await expect(chezLePrincipal.locator(`#discussion-${colocataire.intervention} [data-demande-concernee]`)).toContainText("Pour votre demande : ");
    await chezLePrincipal.context().close();

    // Le colocataire, qui n'a pas déclaré la demande, voit bien la discussion (la base la lui ouvre) et son message.
    const chezLeColocataire = await ouvrir(browser, page, colocataire, `/locataire/${espace.org}/demandes`);
    await expect(chezLeColocataire.getByRole("heading", { level: 1, name: "Mes demandes" })).toBeVisible();
    const discussion = chezLeColocataire.locator(`#discussion-${colocataire.intervention}`);
    await expect(discussion).toBeVisible();
    await expect(discussion).toContainText("ESSAI lot 61 : je passe jeudi matin, qui sera présent ?");
    await expect(discussion.locator("[data-demande-concernee]")).toContainText("Pour la demande : ");
    await expect(discussion.locator("[data-demande-concernee]")).toContainText("ESSAI lot 61 : évier bouché");
    await expect(discussion).not.toContainText("Pour votre demande");
    await expect(chezLeColocataire.locator("h1")).toHaveCount(1);
    expect(await debordementHorizontal(chezLeColocataire)).toBeLessThanOrEqual(1);
    await chezLeColocataire.context().close();
  } finally {
    await db.end();
  }
});
