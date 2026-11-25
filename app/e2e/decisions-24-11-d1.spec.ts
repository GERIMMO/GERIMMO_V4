import { expect, test } from "@playwright/test";
import { Client } from "pg";
import path from "node:path";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

// DÉCISIONS DU DIRIGEANT DU 24/11/2026, LOT D1.
//  Q18 : le menu du propriétaire reste court ; son tableau de bord mène à Statistiques et au Journal.
//  Q13 : chaque article du Journal porte la mention visible « Rédigé avec l’aide de l’IA » (espace et site public).
// L'article est celui du jeu d'essai (seed-parcours.mjs).
//
// REPRISE DU MÊME JOUR (relecture du lot) :
//  M4 : la mention ne s'affiche que pour un article d'origine « ia » ; un article écrit à la main n'en porte pas.
//  M6 : en agence, le lien « Journal » a un sous-titre neutre.
//  B1 : en agence, la signature électronique n'est pas mise en avant (elle y mène à un refus) : l'écran d'avant.
// Ce banc tourne avec le service de signature FERMÉ (réglage livré). Le propriétaire direct, service fermé, est suivi par
// depot-bail-signe-papier.spec.ts ; les quatre combinaisons par tests/decisions-24-11-lot-d1-reprise.test.ts.

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";
const ARTICLE = "e2e-gerer-une-location";
const MENTION = "Rédigé avec l’aide de l’IA";

test.describe("propriétaire", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "proprietaire.json") });

  test("Q18 et Q13 : du tableau de bord aux statistiques, puis au journal, où l'article porte la mention", async ({ page }) => {
    await sansSyntheseAlertes(page);
    await page.goto(`/espace/${ORG}`);
    const liens = page.getByRole("navigation", { name: "Statistiques et journal" });
    await expect(liens.getByRole("link")).toHaveCount(2);
    await expect(liens.getByRole("link", { name: /^Statistiques/ })).toHaveAttribute("href", `/espace/${ORG}/statistiques`);
    await expect(liens.getByRole("link", { name: /^Journal/ })).toHaveAttribute("href", `/espace/${ORG}/journal`);
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);

    await liens.getByRole("link", { name: /^Statistiques/ }).click();
    await expect(page).toHaveURL(`/espace/${ORG}/statistiques`);
    await expect(page.getByRole("heading", { level: 1, name: "Statistiques" })).toBeVisible();

    await page.goto(`/espace/${ORG}`);
    await page.getByRole("navigation", { name: "Statistiques et journal" }).getByRole("link", { name: /^Journal/ }).click();
    await expect(page).toHaveURL(`/espace/${ORG}/journal`);
    await expect(page.getByRole("heading", { level: 1, name: "Le journal Gerimmo" })).toBeVisible();

    await page.goto(`/espace/${ORG}/journal/${ARTICLE}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("article").getByText(MENTION, { exact: true })).toBeVisible();
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
  });
});

test("Q13 : sur le site public, l'article porte la même mention", async ({ page }) => {
  await page.goto(`/journal/${ARTICLE}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("main").getByText(MENTION, { exact: true })).toBeVisible();
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
});

// ── Reprise du lot D1 ───────────────────────────────────────────────────────────────────────────────────────────

/** La base fictive du banc, et elle seule. */
function baseFictive(): Client {
  const cible = process.env.SUPALOCAL_DB;
  const url = new URL(cible ?? "postgres://absente/");
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error("Base fictive locale requise");
  return new Client({ connectionString: cible });
}

test("M4 : un article écrit à la main ne porte pas la mention ; un article d'origine « ia » la garde", async ({ page }) => {
  test.skip(!process.env.SUPALOCAL_DB, "Base API locale fictive obligatoire.");
  const MANUEL = "e2e-article-ecrit-a-la-main";
  const db = baseFictive();
  await db.connect();
  try {
    // Un article fictif paru, d'origine « manuel » (ce que pose le brouillon vierge de la supervision). Rejouable : rien
    // n'est supprimé, l'article est seulement remis en ligne s'il existe déjà.
    await db.query(`insert into public.publications(periode, statut, titre, slug, chapo, corps, facebook_texte, publie_le, origine)
      values ('e2e-reprise-d1', 'publiee', 'TEST fictif : article écrit à la main', $1, 'Chapô fictif de l’article écrit à la main.',
              repeat('Paragraphe fictif écrit à la main par la supervision. ', 8), 'Texte fictif.', now() - interval '1 hour', 'manuel')
      on conflict (slug) do update set statut = 'publiee', publie_le = now() - interval '1 hour'`, [MANUEL]);
    expect((await db.query("select origine from public.publications where slug = any($1) order by slug", [[MANUEL, ARTICLE]])).rows.map(r => r.origine)).toEqual(["manuel", "ia"]);

    await page.goto(`/journal/${MANUEL}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("article écrit à la main");
    await expect(page.locator("main")).toContainText("Paru le");
    await expect(page.getByText(MENTION)).toHaveCount(0);
    await expect(page.locator("[data-mention-ia]")).toHaveCount(0);

    // L'article du jeu d'essai (origine « ia », la valeur par défaut) garde sa mention.
    await page.goto(`/journal/${ARTICLE}`);
    await expect(page.locator("main").getByText(MENTION, { exact: true })).toBeVisible();
  } finally {
    // L'article fictif sort du Journal sans être supprimé : les autres parcours ne le voient pas.
    await db.query("update public.publications set statut = 'archivee' where slug = $1", [MANUEL]).catch(() => undefined);
    await db.end();
  }
});

test.describe("agence", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });
  const AGENCE = "c14c3187-1258-4e58-8822-368c6007e3fa";

  test("M6 et B1 : sous-titre neutre du Journal ; la signature électronique n'est pas mise en avant", async ({ page }) => {
    test.skip(!process.env.SUPALOCAL_DB, "Base API locale fictive obligatoire.");
    await sansSyntheseAlertes(page);

    // M6 : « votre location » parle au propriétaire, pas à une agence.
    await page.goto(`/agence/${AGENCE}`);
    const journal = page.getByRole("navigation", { name: "Statistiques et journal" }).getByRole("link", { name: /^Journal/ });
    await expect(journal).toHaveAttribute("href", `/agence/${AGENCE}/journal`);
    await expect(journal).toContainText("Actualités et conseils de gestion locative");
    await expect(journal).not.toContainText("votre location");

    // B1 : l'état des lieux en cours du jeu d'essai, étape Validation. Le bouton d'avant la décision, en contour, APRÈS
    // le PDF ; aucune phrase ni aucun bouton « Signature électronique ».
    const db = baseFictive();
    await db.connect();
    const edl = (await db.query("select id, bail_id from public.etats_des_lieux where organization_id = $1 and etat = 'brouillon' order by created_at limit 1", [AGENCE])).rows[0];
    await db.end();
    expect(edl, "le jeu d'essai porte un état des lieux en cours").toBeTruthy();
    await page.goto(`/agence/${AGENCE}/baux/${edl.bail_id}/edl/${edl.id}`);
    const navigation = page.getByRole("navigation", { name: "Étapes : État des lieux", exact: true });
    await expect(navigation).toBeVisible();
    const choix = navigation.getByLabel("Aller à une étape", { exact: true });
    if (await choix.isVisible()) await choix.selectOption("3");
    else await navigation.getByRole("button", { name: /^Étape 04 Validation / }).click();
    const pdf = page.getByRole("button", { name: "Générer le PDF", exact: true });
    const zoho = page.getByRole("button", { name: "Signature Zoho · SMS", exact: true });
    await expect(pdf).toBeVisible();
    await expect(zoho).toBeVisible();
    await expect(zoho).toHaveAttribute("data-signature-electronique", "non_proposee");
    expect(await zoho.evaluate((bouton, autre) => Boolean(bouton.compareDocumentPosition(autre!) & Node.DOCUMENT_POSITION_PRECEDING), await pdf.elementHandle())).toBe(true);
    await expect(page.getByRole("button", { name: /Signature électronique/ })).toHaveCount(0);
    await expect(page.locator("[data-voies-signature]")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("proposée en premier");
    // L'étape garde son texte d'avant la décision.
    await expect(page.locator("main")).toContainText("Vérifiez le dossier, préparez le PDF puis déposez la preuve de signature.");
    expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
  });
});
