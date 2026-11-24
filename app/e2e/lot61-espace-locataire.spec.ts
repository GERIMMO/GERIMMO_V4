import { expect, test } from "@playwright/test";
import { debordementHorizontal, entrerDansEspace } from "./aides";

// PHASE 3, LOT 61 — ESPACE DU LOCATAIRE : TROIS ÉCRANS QUI SE CONTREDISAIENT.
//
// Relevés sur les captures de la passe 1, avec le locataire fictif de l'agence fictive (données du jeu de parcours) :
//  1. « Mes demandes » rendait la « Discussion de l'intervention » après toutes les demandes, sans la nommer : avec
//     deux demandes, elle se lisait sous la mauvaise ;
//  2. « Mes paiements » promettait « quittance établie et disponible ici — rien à demander » à côté d'un reçu marqué
//     « Document en préparation » ;
//  3. /compte dit d'écrire au gestionnaire pour les données de la location ; /compte/donnees, où mène son bouton, ne le
//     disait pas, et n'avait ni retour à « Mon espace » ni « Se déconnecter ».
// Lecture seule : rien n'est écrit, aucun e-mail.

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

test("Mes paiements : la promesse de quittance ne contredit plus un document « en préparation »", async ({ page }) => {
  const base = `/locataire/${await entrerDansEspace(page, "locataire")}`;
  await page.goto(`${base}/loyers`);
  await expect(page.getByRole("heading", { level: 1, name: "Mes paiements" })).toBeVisible();
  const phrase = page.locator("[data-phrase-quittance]");
  // La phrase n'existe que s'il reste un loyer à régler (un autre parcours a pu le solder) : on vérifie alors l'accord
  // entre la phrase et l'historique affiché sur le même écran.
  if (await phrase.count()) {
    const enPreparation = (await page.getByText("Document en préparation").count()) > 0;
    await expect(phrase).toHaveAttribute("data-phrase-quittance", enPreparation ? "en-preparation" : "disponible");
    if (enPreparation) {
      await expect(phrase).toContainText("aura complété les informations obligatoires du document");
      await expect(phrase).not.toContainText("rien à demander");
      await expect(phrase.getByRole("link", { name: /écrire à mon (gestionnaire|bailleur)/ })).toHaveAttribute("href", `${base}/contact`);
    } else {
      await expect(phrase).toContainText("rien à demander");
    }
  }
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
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
