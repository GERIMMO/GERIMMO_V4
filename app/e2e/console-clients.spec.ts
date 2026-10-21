import { expect, test } from "@playwright/test";
import path from "node:path";
import { Client } from "pg";
import { writeFileSync } from "node:fs";
import { formaterDateHeureParis } from "../src/lib/heure-paris";
import { LIBELLES_MESURES, SOURCES_DIRECTION, type FaitsDirection } from "../src/lib/faits-direction";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

/**
 * LA CONSOLE, TELLE QUE LA SUPERVISION LA DEMANDE (19/09).
 *
 * Trois demandes du porteur du projet, trois vérifications :
 *  1. la connexion mène DROIT à la console, sans sélecteur d'espaces ;
 *  2. « Clients » réunit artisans, agences et propriétaires bailleurs, les
 *     inscriptions en attente en évidence ;
 *  3. la fiche d'un client porte un bouton qui entre vraiment dans son espace.
 */
test.use({ storageState: path.join(__dirname, ".auth", "superadmin.json") });

test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
});

test("la supervision arrive sur sa console, pas sur un sélecteur d'espaces", async ({ page }) => {
  await page.goto("/espaces");
  await page.waitForURL(/\/admin\/brief$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Bureau de direction" })).toBeVisible();
});

test("les faits de direction se préparent manuellement avec cinq sources datées", async ({ page }, info) => {
  const cible = process.env.SUPALOCAL_DB;
  test.skip(!cible, "La base API fictive locale est requise pour vérifier le nouvel instantané.");
  const url = new URL(cible!);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) {
    throw new Error("Une base API de recette locale est obligatoire.");
  }
  const db = new Client({ connectionString: cible });
  await db.connect();
  try {
    // Cette connexion vérifie uniquement la persistance. Le seul geste d'écriture
    // reste le clic authentifié ci-dessous, via l'action normale du produit.
    await db.query("set default_transaction_read_only = on");
    const lireDernier = async () => (await db.query<FaitsDirection>(
      `select s.id, s.jour::text, s.genere_le::text, s.version_regles, s.sources, s.indisponibles
       from public.brief_direction_snapshots s
       join auth.users u on u.id = s.auteur_reel
       where u.email = 'superadmin@example.com'
       order by s.genere_le desc, s.id desc limit 1`
    )).rows[0];
    await page.goto("/admin/brief");
    await expect(page.getByRole("link", { name: /^Donner une consigne/ })).toHaveAttribute("href", "/admin/consignes");
    const avant = await lireDernier();
    const borne = (await db.query<{ instant: string }>("select clock_timestamp()::text instant")).rows[0].instant;
    const preparer = page.locator("main > header").getByRole("button", { name: /^(Préparer le point|Actualiser)$/ });
    await preparer.click();
    let nouveau: FaitsDirection | undefined;
    await expect.poll(async () => {
      nouveau = await lireDernier();
      return Boolean(nouveau && nouveau.id !== avant?.id && new Date(nouveau.genere_le).getTime() >= new Date(borne).getTime());
    }, { message: "Le clic doit produire un nouvel instantané daté, pas seulement afficher un ancien relevé." }).toBe(true);
    await expect(preparer).toBeEnabled();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    expect(nouveau!.indisponibles).toEqual([]);

    // Après une relecture réelle de la page, chaque date et chaque montant doit
    // correspondre à l'instantané nouvellement enregistré, même dans la même minute.
    await page.reload();
    const faits = page.getByRole("region", { name: "Les points de vigilance" });
    await expect(faits.getByText(`Relevé du ${formaterDateHeureParis(nouveau!.genere_le)}`, { exact: true })).toBeVisible();
    await faits.getByText("Comprendre ces indicateurs", { exact: true }).click();
    await expect(faits.getByText(`Règles de calcul : version ${nouveau!.version_regles}.`, { exact: false })).toBeVisible();
    for (const [cle, nom] of Object.entries(SOURCES_DIRECTION)) {
      const source = nouveau!.sources[cle as keyof typeof SOURCES_DIRECTION];
      expect(source.statut).toBe("disponible");
      expect(source.donnees).not.toBeNull();
      expect(source.observe_le).not.toBeNull();
      const carte = faits.getByRole("article").filter({ has: page.getByRole("heading", { name: nom, exact: true }) });
      await expect(carte.getByText(`Observé le ${formaterDateHeureParis(source.observe_le)}`, { exact: true })).toBeVisible();
      for (const [mesure, valeur] of Object.entries(source.donnees!.mesures)) {
        const ligne = carte.locator("dl > div").filter({ has: page.getByText(LIBELLES_MESURES[mesure] ?? mesure, { exact: true }) });
        const attendu = mesure.endsWith("_eur") ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(valeur) : valeur.toLocaleString("fr-FR");
        await expect(ligne.getByRole("definition")).toHaveText(attendu);
      }
    }
    await expect(faits.getByText(/Observé le/)).toHaveCount(5);
    await expect(faits.getByRole("alert")).toHaveCount(0);
    expect(await debordementHorizontal(page)).toBe(0);
    const preuves = info.outputPath(".");
    writeFileSync(`${preuves}/e2e-faits-direction-persistes.json`, JSON.stringify({ before_id: avant?.id ?? null, before_click: borne, after: nouveau, sql_read_only: true }, null, 2) + "\n");
    await page.screenshot({ path: `${preuves}/ui-faits-direction-mobile.png`, fullPage: true });
  } finally {
    await db.end();
  }
});

test("« Utilisateurs » ouvre les personnes et conserve les trois familles d’espaces", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Menu supervision", exact: true }).click();
  // Annuaire individuel, puis espaces clients depuis son lien explicite.
  await page.getByRole("navigation", { name: "Navigation de la supervision" }).getByRole("link", { name: /^Utilisateurs/ }).click();
  await page.waitForURL(/\/admin\/clients/);

  await expect(page.getByRole("heading", { name: "Tous les utilisateurs", level: 1 })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Rôle", exact: true })).toBeVisible();
  await expect(page.locator('a[href^="/admin/comptes/"]').first()).toBeVisible();
  await page.getByRole("link", { name: "Espaces clients et entreprises" }).click();
  await page.waitForURL(/vue=espaces/);
  await expect(page.getByRole("heading", { name: "Utilisateurs", level: 1 })).toBeVisible();
  for (const famille of [/^Propriétaires bailleurs/, /^Artisans/, /^Agences/]) {
    await expect(page.getByRole("heading", { name: famille, level: 3 })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: /Inscriptions à valider/ })).toBeVisible();
  await page.getByRole("link", { name: /Inscriptions à valider/ }).click();
  await page.waitForURL(/famille=attente/);
  await page.getByRole("link", { name: "Effacer les filtres", exact: true }).click();
  await page.waitForURL(/\/admin\/clients\?vue=espaces$/);
  await expect(page.getByRole("heading", { name: /^Propriétaires bailleurs/, level: 3 })).toBeVisible();

  expect(await debordementHorizontal(page)).toBe(0);
});

test("la fiche d'une agence est complète, et son bouton entre vraiment dans l'espace", async ({
  page,
}) => {
  await page.goto("/admin/clients?vue=espaces");

  // « Ouvrir une organisation » partage ce préfixe : on l'écarte, sinon c'est
  // le formulaire de création qu'on ouvre, pas une fiche.
  const premiereAgence = page.getByRole("region", { name: "Agences", exact: true })
    .locator('a[href^="/admin/organisations/"]:not([href$="/nouvelle"])')
    .first();
  await expect(premiereAgence).toBeVisible();
  await premiereAgence.click();
  await page.waitForURL(/\/admin\/organisations\/[0-9a-f-]+$/);

  // La fiche porte ce qu'on attend d'une fiche client, pas seulement deux
  // listes : identité, parc, parrainage, comptes.
  for (const titre of ["Identité", "Son parc", "Parrainage", "Comptes rattachés"]) {
    await expect(page.getByRole("heading", { name: titre })).toBeVisible();
  }
  expect(await debordementHorizontal(page)).toBe(0);

  // Et le geste demandé : entrer dans sa session depuis sa fiche.
  await page.getByRole("link", { name: "Entrer dans son espace" }).click();
  await page.waitForURL(/\/agence\/[0-9a-f-]+/, { timeout: 20_000 });
});

test("le diagnostic artisan exige un motif, reste en lecture seule et se ferme", async ({
  page,
}) => {
  await page.goto("/admin/clients?vue=espaces");

  const premierArtisan = page.locator('a[href^="/admin/clients/artisans/"]').first();
  await expect(premierArtisan).toBeVisible();

  await premierArtisan.click();
  await page.waitForURL(/\/admin\/clients\/artisans\/[0-9a-f-]+/);
  const fiche = page.url();
  await expect(page.getByRole("heading", { name: "Justificatifs" })).toBeVisible();

  // Le motif part au journal d'audit avec l'ouverture.
  // « Motif » tout court viserait aussi celui du refus d'inscription.
  await expect(page.getByLabel(/Motif du diagnostic/)).toHaveAttribute("required", "");
  await page.getByLabel(/Motif du diagnostic/).fill("recette e2e");
  await page.getByRole("button", { name: /Diagnostiquer l’espace de/ }).click();

  try {
  // Le portail est consultable ; les mutations restent interdites.
  await page.waitForURL(/\/artisan/, { timeout: 20_000 });
  const bandeau = page.getByRole("status").filter({ hasText: "Diagnostic en lecture seule" });
  await expect(bandeau).toBeVisible();
  await expect(bandeau).toContainText(/aucune modification ni aucun envoi autorisé/i);
  expect(await debordementHorizontal(page)).toBe(0);

  await page.screenshot({ path: test.info().outputPath("ui-diagnostic-artisan-mobile.png"), fullPage: true });

  // Et la sortie est à portée de pouce, sur chaque écran du portail.
  await bandeau.getByRole("button", { name: "Fermer le diagnostic" }).click();
  await page.waitForURL(/\/admin\/clients\/artisans\//, { timeout: 20_000 });
  expect(page.url()).toBe(fiche);

  // Une fois sortie, la supervision n'emprunte plus rien : le portail ne la
  // reconnaît plus comme artisan.
  await page.goto("/artisan");
  await expect(
    page.getByRole("status").filter({ hasText: "Diagnostic en lecture seule" })
  ).toHaveCount(0);
  } finally {
    // Une assertion défaillante ne doit pas laisser le compte partagé en diagnostic.
    await page.goto("/artisan");
    const fermer = page.getByRole("button", { name: "Fermer le diagnostic" });
    if (await fermer.count()) {
      await fermer.click();
      await page.waitForURL(/\/admin\/clients\/artisans\//);
    }
  }
});
