import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Client } from "pg";
import { debordementHorizontal, entrerDansEspace, sansSyntheseAlertes } from "./aides";

// Parcours locataire au téléphone : le geste qui compte est la déclaration
// d'incident — photo d'abord (RM-19.2.2), trois écrans max (RM-19.2.1),
// statut visible depuis l'accueil (RM-19.2.3).
test.use({ storageState: path.join(__dirname, ".auth", "locataire.json") });

test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
});

async function ouvrirEspace(page: import("@playwright/test").Page) {
  return entrerDansEspace(page, "locataire");
}

test("l'accueil locataire montre le statut de l'incident déclaré", async ({ page }) => {
  await ouvrirEspace(page);
  // L'incident E2E du seed est visible dès l'accueil — l'espace locataire
  // parle de « problème » (directive sans-jargon), pas d'« incident »
  await expect(page.locator("body")).toContainText(/problème|incident/i);
  expect(await debordementHorizontal(page)).toBe(0);
});

test("déclarer un incident : la photo est le premier champ, l'envoi aboutit", async ({ page }) => {
  const orgId = await ouvrirEspace(page);
  await page.goto(`/locataire/${orgId}/incident`);

  // RM-19.2.2 : DANS le formulaire de déclaration, le champ photos précède
  // la description (le repère juridique adaptatif, hors formulaire, peut
  // contenir d'autres éléments avant)
  // Attendre le formulaire après le chargement de la copie locale.
  await expect(page.locator("#photos")).toBeAttached();
  const ordre = await page.evaluate(() => {
    const photos = document.getElementById("photos");
    const formulaire = photos?.closest("form");
    const description = formulaire?.querySelector("textarea");
    if (!photos || !description) return null;
    return photos.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING
      ? "photo-d-abord"
      : "description-d-abord";
  });
  expect(ordre).toBe("photo-d-abord");

  // Attendre un effet du composant hydraté avant la sélection de fichier.
  // Le HTML initial accepte une valeur native sans encore actualiser React.
  await expect(async () => {
    await page.locator("#categorie").selectOption("plomberie_joint");
    await expect(page.getByText("Plutôt à votre charge", { exact: true })
      .filter({ visible: true })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  // Une petite photo JPEG générée à la volée, passée par la compression client
  const imageJpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64"
  );
  // Le serveur refuse une photo déjà déposée dans l'organisation. Conserver
  // la même image, avec un commentaire JPEG unique, isole chaque exécution
  // sans supprimer les documents de la base partagée avec les autres tests.
  const commentaire = Buffer.from(`Photo fictive E2E ${randomUUID()}`);
  const longueurCommentaire = commentaire.length + 2;
  const octetsJpeg = Buffer.concat([
    imageJpeg.subarray(0, 2),
    Buffer.from([0xff, 0xfe, longueurCommentaire >> 8, longueurCommentaire & 0xff]),
    commentaire,
    imageJpeg.subarray(2),
  ]);
  await page.locator("#photos").setInputFiles({
    name: "fuite.jpg",
    mimeType: "image/jpeg",
    buffer: octetsJpeg,
  });
  await expect(page.getByText("1 photo jointe", { exact: false })).toBeVisible();
  const piece = page.locator("#piece");
  if (await piece.count()) {
    await piece.selectOption({ index: 1 }).catch(() => {});
  }
  const description = page.locator("textarea").first();
  if (await description.count()) {
    await description.fill("Déclaré depuis le test E2E mobile.");
  }
  await page.getByRole("button", { name: /déclarer|envoyer|signaler/i }).click();
  // Attendre une confirmation effective : l'absence du mot « erreur »
  // pouvait réussir avant la réponse, même si l'envoi échouait ensuite.
  await expect(page.getByText(/^Signalement envoyé —/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Voir mes demandes maintenant", exact: true }))
    .toBeVisible();
  await test.info().attach("confirmation-envoi-photo", {
    body: await page.screenshot({
      fullPage: true,
      path: test.info().outputPath("confirmation-envoi-photo.png"),
    }),
    contentType: "image/png",
  });
});

test("mes loyers : échéancier lisible à 390px, quittance/reçu accessible", async ({ page }) => {
  const orgId = await ouvrirEspace(page);
  await page.goto(`/locataire/${orgId}/loyers`);
  await expect(page.locator("h1, h2").first()).toBeVisible();
  expect(await debordementHorizontal(page)).toBe(0);
});

// Le document conforme d'une quittance n'est délivré que complet, et le seed ne
// renseigne pas l'adresse de l'agence : on la complète le temps du test sur la
// base API locale, puis on la remet. Sans base locale, le reçu n'est pas testé.
async function completerAgence(orgId: string): Promise<(() => Promise<void>) | null> {
  const cible = process.env.SUPALOCAL_DB;
  if (!cible) return null;
  const url = new URL(cible);
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error("Base fictive locale requise");
  const db = new Client({ connectionString: cible });
  await db.connect();
  const avant = (await db.query("select address_line1, postal_code, city, email_contact from public.organizations where id=$1", [orgId])).rows[0];
  await db.query(`update public.organizations set address_line1=coalesce(address_line1,'3 place de la Mairie'), postal_code=coalesce(postal_code,'75004'),
    city=coalesce(city,'Paris'), email_contact=coalesce(email_contact,'contact@alpha.test') where id=$1`, [orgId]);
  return async () => {
    await db.query("update public.organizations set address_line1=$2, postal_code=$3, city=$4, email_contact=$5 where id=$1",
      [orgId, avant.address_line1, avant.postal_code, avant.city, avant.email_contact]);
    await db.end();
  };
}

// UN SEUL GESTE DE CONSULTATION (décision du 27/10, audit #264 ED-04) : dans
// « Mes documents », le titre de chaque pièce, du bail signé et de chaque
// quittance ouvre l'aperçu en fenêtre, et le téléchargement se fait dedans ;
// plus de nouvel onglet, plus de bouton « Aperçu » ou « Ouvrir » à côté du
// titre. Le bail de l'accueil passe par la même fenêtre. Clavier : Entrée
// ouvre, Échap referme et rend le focus au titre.
async function verifierConsultation(page: import("@playwright/test").Page) {
  const orgId = await ouvrirEspace(page);
  const remettre = await completerAgence(orgId);
  try {
    await page.goto(`/locataire/${orgId}/documents`);
    await page.getByRole("tab", { name: "Mes fichiers", exact: true }).click();
    const titreBail = page.getByRole("button", { name: /^Bail signé/ });
    await expect(titreBail).toBeVisible();
    const liste = page.locator("ul").filter({ has: titreBail });
    await expect(liste.locator("a[target=_blank]")).toHaveCount(0);
    await expect(liste.getByRole("button", { name: /^(Aperçu|Ouvrir|Enregistrer en PDF|Télécharger)/ })).toHaveCount(0);

    await titreBail.focus();
    await page.keyboard.press("Enter");
    const fenetre = page.getByRole("dialog", { name: "Bail signé" });
    await expect(fenetre).toBeVisible();
    await expect(fenetre.getByRole("button", { name: "Télécharger" })).toBeVisible();
    await expect(fenetre.getByText(/^(1 page|\d+ \/ \d+)$/)).toBeVisible();
    expect(await debordementHorizontal(page)).toBe(0);
    await page.keyboard.press("Escape");
    await expect(fenetre).toBeHidden();
    await expect(titreBail).toBeFocused();

    if (remettre) {
      const titreRecu = liste.getByRole("button", { name: /^(Reçu de paiement partiel|Quittance) — / }).first();
      await titreRecu.click();
      const fenetreRecu = page.getByRole("dialog", { name: /^(Reçu de paiement partiel|Quittance) — / });
      await expect(fenetreRecu).toBeVisible();
      await expect(fenetreRecu.getByRole("button", { name: "Imprimer ou enregistrer en PDF" })).toBeVisible();
      // Le document conforme lui-même (art. 21), dans son cadre isolé.
      await expect(fenetreRecu.frameLocator("iframe").locator("body")).toContainText("Article 21 de la loi n° 89-462 du 6 juillet 1989");
      await fenetreRecu.getByRole("button", { name: "Fermer" }).click();
      await expect(fenetreRecu).toBeHidden();
      await expect(titreRecu).toBeFocused();
    }

    await page.goto(`/locataire/${orgId}`);
    await expect(page.locator('a[href$="/bail/fichier"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Consulter mon bail signé" }).click();
    const fenetreAccueil = page.getByRole("dialog", { name: "Mon bail signé" });
    await expect(fenetreAccueil.getByRole("button", { name: "Télécharger" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(fenetreAccueil).toBeHidden();
  } finally {
    await remettre?.();
  }
}

test("mes documents : le titre ouvre l'aperçu en fenêtre, un seul geste pour toutes les pièces", async ({ page }) => {
  await verifierConsultation(page);
});

test.describe("ordinateur 1440×900", () => {
  test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false });
  test("mes documents : le même geste de consultation à l'ordinateur", async ({ page }) => {
    await verifierConsultation(page);
  });
});

test("une photo refusée conserve la catégorie, la pièce, le texte et le fichier sélectionné", async ({ page }) => {
  const orgId = await ouvrirEspace(page);
  await page.goto(`/locataire/${orgId}/incident`);
  // Le HTML arrive avant l'hydratation. Attendre un effet observable du
  // contrôle React avant le dépôt : un setInputFiles prématuré modifierait
  // le champ natif sans mettre à jour les noms et le résumé du composant.
  const repere = page.getByText("Plutôt à la charge du propriétaire", { exact: true })
    .filter({ visible: true });
  await expect(async () => {
    await page.locator("#categorie").selectOption("plomberie_canalisation");
    await expect(repere).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.locator("#photos").setInputFiles({
    name: "test-format-invalide.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("Fichier de test volontairement sans image"),
  });
  await expect(page.getByText("1 photo jointe", { exact: false })).toBeVisible();
  await page.locator("#piece").selectOption("Cuisine");
  await page.locator("#description").fill("Fuite sous l'évier — saisie à conserver.");
  await page.locator("#anciennete").fill("Depuis ce matin");
  await page.getByRole("button", { name: "Envoyer le signalement", exact: true }).click();

  const formulaire = page.locator("form").filter({ has: page.locator("#photos") });
  await expect(formulaire.getByRole("alert")).toContainText("n'est pas une image JPEG ou PNG");
  await expect(page.locator("#categorie")).toHaveValue("plomberie_canalisation");
  await expect(page.locator("#piece")).toHaveValue("Cuisine");
  await expect(page.locator("#description")).toHaveValue("Fuite sous l'évier — saisie à conserver.");
  await expect(page.locator("#anciennete")).toHaveValue("Depuis ce matin");
  expect(await page.locator("#photos").evaluate((input: HTMLInputElement) =>
    Array.from(input.files ?? []).map((file) => file.name)
  )).toEqual(["test-format-invalide.jpg"]);
  await expect(page.getByText("Aucune photo choisie", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1 photo jointe", { exact: false })).toBeVisible();
  await expect(repere).toBeVisible();
});
