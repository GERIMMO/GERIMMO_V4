import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";
import { CONFIDENTIALITE_DATE } from "../src/lib/editeur";

// DÉFAUTS D'ÉCRAN MAJEURS (passe 1, relecture des captures), pages publiques et console du super admin.
// Ce que les tests unitaires ne voient pas : la mise en page à 390 px, le proxy, et l'accord entre deux écrans lus
// dans le même banc. L'outil IRL (E054 = E167) : e2e/outils.spec.ts ; la fiche d'un compte (E070 = E180) :
// e2e/compte-supervision.spec.ts. Unitaires : tests/ecrans-majeurs-console.test.ts et les tests cités au commit.
// Aucune écriture : la seule lecture en base cherche l'article du jeu d'essai (seed-parcours.mjs).

/** Un seul h1, pas de débordement horizontal (consignes des lots d'écrans). */
async function tenue(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
}

test.describe("pages publiques", () => {
  test("E173 : un lien de signature non valable ne promet pas un acte de cautionnement", async ({ page }) => {
    await page.goto(`/signature/caution/${"A".repeat(43)}`);
    await expect(page.getByText("Ce lien n’est pas valable.", { exact: false })).toBeVisible();
    await expect(page.getByText("Un document à signer en ligne.", { exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("cautionnement");
    await tenue(page);
  });

  test("E056 : la page Confidentialité porte sa propre date de mise à jour", async ({ page }) => {
    await page.goto("/confidentialite");
    await expect(page.getByText(`Dernière mise à jour : ${CONFIDENTIALITE_DATE}.`, { exact: true })).toBeVisible();
    await tenue(page);
  });
});

test.describe("console du super admin", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "superadmin.json") });
  test.beforeEach(async ({ page }) => { await sansSyntheseAlertes(page); });

  test("E069 = E179 : les demandes de contact ne renvoient plus à la vitrine, fermée au connecté", async ({ page }) => {
    await page.goto("/admin/devis");
    await expect(page.getByRole("heading", { level: 1, name: "Demandes de contact" })).toBeVisible();
    await expect(page.locator('a[href="/#contact"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Voir le formulaire sur le site" })).toHaveCount(0);
    await tenue(page);
  });

  test("E088 : à 390 px, le champ de recherche des prospects garde sa largeur et son libellé sur une ligne", async ({ page }) => {
    await page.goto("/admin/territoire#prospects");
    const champ = page.locator('input[name="qProspect"]');
    await champ.scrollIntoViewIfNeeded();
    const largeur = (await champ.boundingBox())?.width ?? 0;
    expect(largeur).toBeGreaterThanOrEqual(200);
    // Le libellé « Nom, e-mail ou origine » tient sur une seule ligne (il se cassait mot à mot sur cinq lignes).
    const lignes = await champ.evaluate((input) => {
      const texte = [...(input.parentElement?.childNodes ?? [])].find((n) => n.nodeType === Node.TEXT_NODE);
      if (!texte) return -1;
      const plage = document.createRange();
      plage.selectNodeContents(texte);
      return new Set([...plage.getClientRects()].map((r) => Math.round(r.top))).size;
    });
    expect(lignes).toBe(1);
    // La cible reste d'au moins 24 px de haut.
    expect((await champ.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(24);
    await page.screenshot({ path: "e2e/.results/tour5-territoire-prospects-390.png", fullPage: false });
    await tenue(page);
  });

  test("E089 : la veille ne propose « Commander la collecte » que si « Automatismes » peut lancer la tâche", async ({ page }) => {
    await page.goto("/admin/equipes");
    const lancementImpossible = await page.getByText("Le lancement manuel attend la connexion des traitements.", { exact: false }).isVisible();
    await page.goto("/admin/veille");
    await expect(page.getByRole("heading", { level: 1, name: "Veille réglementaire" })).toBeVisible();
    const etatVide = page.locator(".vide-guide");
    if (await etatVide.count()) {
      if (lancementImpossible) {
        await expect(etatVide.getByRole("link", { name: "Commander la collecte" })).toHaveCount(0);
        await expect(etatVide.getByRole("link", { name: "Vérifier les connexions" })).toHaveAttribute("href", "/admin/sante");
      } else {
        await expect(etatVide.getByRole("link", { name: "Commander la collecte" })).toHaveAttribute("href", "/admin/equipes");
      }
    }
    await tenue(page);
  });

  test("E198 : l'éditeur d'un article paru dit la connexion Facebook comme « Marketing et contenus »", async ({ page }) => {
    test.skip(!process.env.SUPALOCAL_DB, "Base API locale fictive obligatoire.");
    const cible = process.env.SUPALOCAL_DB!;
    const url = new URL(cible);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) throw new Error("Base fictive locale requise");
    const db = new Client({ connectionString: cible });
    await db.connect();
    let id: string | undefined;
    try {
      id = (await db.query("select id from public.publications where slug = 'e2e-gerer-une-location' and statut = 'publiee' and facebook_post_id is null")).rows[0]?.id;
    } finally {
      await db.end();
    }
    test.skip(!id, "Article paru du jeu d'essai absent ou déjà diffusé.");
    await page.goto("/admin/marketing#canaux");
    const canaux = page.locator("#canaux");
    const relie = await canaux.getByText("Relié", { exact: true }).isVisible();
    await page.goto(`/admin/publications/${id}`);
    await expect(page.getByRole("heading", { level: 1, name: "Modifier l’article" })).toBeVisible();
    if (relie) {
      await expect(page.getByText("La diffusion utilise la Page Facebook reliée à Gerimmo.", { exact: false })).toBeVisible();
    } else {
      await expect(page.getByText("Page Facebook connectée", { exact: false })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Publier sur Facebook" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Vos canaux de diffusion" })).toHaveAttribute("href", "/admin/marketing#canaux");
    }
    await tenue(page);
  });

  test("E199 : « Paiements Stripe » n'est pas vert quand une clé de Stripe manque", async ({ page }) => {
    await page.goto("/admin/sante");
    // Les deux lignes de Stripe dans « Connexions des services » (lib/sante-service.ts) et leur pastille.
    const connexions = page.locator("details#connexions");
    let stripeManque = false;
    for (const usage of ["Facturation des abonnements", "Réception des événements d'abonnement"]) {
      const pastille = connexions.locator("li.rang").filter({ hasText: usage }).first().locator(":scope > span.puce");
      if ((await pastille.textContent())?.trim() === "manque") stripeManque = true;
    }
    const section = page.locator("details#controle-stripe");
    if (stripeManque) {
      await expect(section).toHaveAttribute("data-tone", "ambre");
      await expect(section.locator("summary")).toContainText("Stripe non relié");
    }
    await tenue(page);
  });
});
