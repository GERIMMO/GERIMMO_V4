import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

/**
 * LA FICHE DE DÉBOGAGE D'UN COMPTE (25/09).
 *
 * Le porteur : « je veux être le super admin, que toutes les actions soient
 * enregistrées, je veux juste pouvoir déboguer au besoin. » Depuis la fiche
 * d'une organisation, chaque compte rattaché ouvre sa fiche : état de
 * connexion, rôles avec l'entrée dans l'espace (sous l'identité de la
 * supervision, journalisée), journal d'audit et journal technique.
 */
test.use({ storageState: path.join(__dirname, ".auth", "superadmin.json") });

test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
});

test("depuis une organisation, la fiche d'un compte dit son état, ses rôles et ses journaux", async ({ page }) => {
  await page.goto("/admin/clients?vue=espaces");
  await page.getByRole("link", { name: /Agence Alpha/ }).first().click();
  await expect(page).toHaveURL(/\/admin\/organisations\//);
  // Les gestes de contrôle (audit console 27/09) : repliés, confirmés, jamais sous l'identité du client.
  await expect(page.getByRole("heading", { name: "Accès à l’espace client" })).toBeVisible();
  await page.getByRole("heading", { name: "Accès à l’espace client", exact: true }).click();
  await expect(page.getByText(/Elles ne résilient pas l’abonnement Stripe et n’arrêtent pas ses prélèvements/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inviter le responsable" })).toBeVisible();
  const lien = page.getByRole("link", { name: "Fiche du compte →" }).first();
  await expect(lien).toBeVisible();
  await lien.click();
  await expect(page).toHaveURL(/\/admin\/comptes\/[0-9a-f-]{36}$/);

  await expect(page.getByRole("heading", { level: 1 })).toContainText("@");
  await expect(page.getByRole("heading", { name: "État du compte" })).toBeVisible();
  await expect(page.getByText("Dernière connexion")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rôles et espaces" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Actions sur ce compte" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Événements techniques" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contrôler l’accès" })).toBeVisible();
  // L'entrée dans l'espace se fait avec l'identité de la supervision, jamais celle du compte.
  await expect(page.getByText("Les consultations et actions réalisées dans les espaces restent enregistrées à votre nom.", { exact: true })).toBeVisible();
  expect(await debordementHorizontal(page)).toBe(0);

  const entrer = page.getByRole("link", { name: /Entrer dans son espace|Ouvrir son dossier locataire/ }).first();
  await expect(entrer).toBeVisible();
  await entrer.click();
  await expect(page).toHaveURL(/\/agence\//);
});

const CHAMP_RECHERCHE = "Nom, ville, email, SIRET ou référence";

/** Ouvre la fenêtre de recherche de la console depuis le point du matin et rend son champ. */
async function ouvrirRecherche(page: Page) {
  await page.goto("/admin/brief");
  // Au téléphone (une seule barre, 25/09), la recherche vit dans le menu.
  // Sur la construction de production, un clic parti avant l'hydratation est
  // rejoué par React une fois la page vivante : le menu peut se refermer juste
  // après s'être ouvert. On rejoue donc toute la séquence — ouvrir le menu si
  // besoin, puis « Rechercher » — jusqu'à ce que le champ soit réellement là.
  // Le bouton du menu change de nom une fois ouvert (« Fermer le menu ») : on
  // le vise par ce qu'il commande.
  const menu = page.locator('button[aria-controls="menu-supervision"]');
  const champ = page.getByLabel(CHAMP_RECHERCHE);
  await expect(async () => {
    if ((await menu.isVisible()) && (await menu.getAttribute("aria-expanded")) !== "true") await menu.click();
    // Deux boutons portent ce nom (barre haute masquée au téléphone, entrée du menu) : le visible.
    await page.locator("button:visible", { hasText: /Rechercher/ }).first().click({ timeout: 1_000 });
    await expect(champ).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  return champ;
}

test("la recherche de la console trouve un compte par son adresse", async ({ page }) => {
  const champ = await ouvrirRecherche(page);
  await champ.fill("admin.alpha");
  const resultat = page.locator("[data-resultat]").filter({ hasText: "Compte" }).first();
  await expect(resultat).toBeVisible();
  // Rôles lisibles (audit console 27/09) : jamais le code « admin_agence ».
  await expect(resultat).not.toContainText("admin_agence");
  // Entrée ouvre le résultat en surbrillance (le premier par défaut), comme le promet le pied.
  const premier = page.locator("[data-resultat][data-actif]");
  await expect(premier).toHaveCount(1);
  const cible = await premier.getAttribute("href");
  await champ.press("Enter");
  await expect(page).toHaveURL(new RegExp(`${cible}$`));
});

// X18 (fiche SA-09), décision du 14/10/2026 ; constat de l'audit du 13/10 (S-RECHERCHE) : « INC-2026-0003 » répondait
// « Aucun client trouvé ». Rejoué de bout en bout (relecture du 15/10) : le numéro d'un incident de la base de
// démonstration donne un résultat « Incident », en tête, et Entrée ouvre la fiche de son organisation — jamais l'incident.
test("la recherche de la console retrouve un incident par son numéro et ouvre la fiche de son organisation", async ({ page }) => {
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible, "La base API fictive locale est requise pour lire le numéro d'un incident de démonstration.");
  const url = new URL(cible!);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) {
    throw new Error("Une base API de recette locale est obligatoire.");
  }
  const db = new Client({ connectionString: cible });
  await db.connect();
  type IncidentDemo = { numero: string; organization_id: string; name: string };
  let incident: IncidentDemo | undefined;
  try {
    // Lecture seule : le seul geste est la recherche, par l'écran.
    await db.query("set default_transaction_read_only = on");
    ({ rows: [incident] } = await db.query<IncidentDemo>(
      `select i.numero, i.organization_id, o.name from public.incidents i join public.organizations o on o.id = i.organization_id
        where i.numero ~ '^INC-[0-9]{4}-[0-9]{4,}$'
          and (select count(*) from public.incidents j where j.numero = i.numero) = 1
        order by i.created_at limit 1`
    ));
  } finally {
    await db.end();
  }
  test.skip(!incident, "Aucun incident sur ce banc (node e2e/local/seed-parcours.mjs en déclare un).");
  const champ = await ouvrirRecherche(page);
  // Saisi en minuscules : la casse du numéro est indifférente.
  await champ.fill(incident!.numero.toLowerCase());
  const premier = page.locator("[data-resultat][data-actif]");
  await expect(premier).toHaveCount(1);
  await expect(premier).toContainText("Incident");
  await expect(premier).toContainText(incident!.name);
  await expect(premier).toHaveAttribute("href", `/admin/organisations/${incident!.organization_id}`);
  await expect(page.getByText("Aucun résultat")).toHaveCount(0);
  await champ.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/admin/organisations/${incident!.organization_id}$`));
});
