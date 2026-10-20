import { expect, test } from "@playwright/test";
import path from "node:path";
import { Client } from "pg";
import { debordementHorizontal, sansSyntheseAlertes } from "./aides";

/**
 * LA LISTE D'ATTENTE DES AGENCES, VUE DE LA CONSOLE (20/10/2026).
 *
 * Une agence s'est inscrite sur /agences ; le dirigeant la voit dans /admin/liste-attente, la marque contactée (la
 * base garde le statut et la date), exporte la liste en CSV. Un visiteur sans session n'obtient jamais le fichier.
 * Modèle : console-clients.spec.ts (session super-admin, base API locale par `pg`).
 */
test.use({ storageState: path.join(__dirname, ".auth", "superadmin.json") });

test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
});

const CIBLE = process.env.SUPALOCAL_DB;

test("la console liste l'agence inscrite, la marque contactée et exporte le CSV ; sans session, rien ne sort", async ({ page, browser }, info) => {
  test.skip(!CIBLE, "La base API fictive locale est requise pour insérer une inscription de test.");
  const url = new URL(CIBLE!);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/^gerimmo_ci_[a-z_]+_api$/.test(url.pathname.slice(1))) {
    throw new Error("Une base API de recette locale est obligatoire.");
  }
  const suffixe = Date.now().toString(36);
  const agence = `Agence E2E Liste ${suffixe}`;
  const email = `liste-attente-${suffixe}@console-e2e.test`;
  const db = new Client({ connectionString: CIBLE });
  await db.connect();
  let id: string | null = null;
  try {
    // L'inscription telle que l'action serveur du site l'écrit (clé de service) ; le seul geste d'écriture du
    // produit testé ici est le clic authentifié ci-dessous.
    const inseree = await db.query<{ id: string }>(
      `insert into public.liste_attente_agences (email, agence, contact, telephone, code_postal, nb_lots, message, source)
       values ($1, $2, 'Camille Recette', '01 23 45 67 89', '75011', '50_a_199', $3, '/agences') returning id`,
      [email, agence, "Message de recette ; avec « guillemets » et\nun saut de ligne."],
    );
    id = inseree.rows[0].id;

    await page.goto("/admin/liste-attente");
    await expect(page.getByRole("heading", { name: "Liste d’attente des agences", level: 1 })).toBeVisible();
    const rang = page.locator(`#agence-${id}`);
    await expect(rang).toBeVisible();
    await expect(rang).toContainText(agence);
    await expect(rang).toContainText("Camille Recette");
    await expect(rang).toContainText("De 50 à 199 lots");
    await expect(rang.getByRole("link", { name: email })).toHaveAttribute("href", `mailto:${email}`);
    await expect(rang.getByText("En attente", { exact: true })).toBeVisible();
    // Le message est sur deux lignes : il est replié.
    await rang.getByText("Lire le message", { exact: true }).click();
    await expect(rang).toContainText("un saut de ligne.");

    await rang.getByRole("button", { name: "Marquer comme contactée", exact: true }).click();
    await expect(rang.getByText("Contactée", { exact: true })).toBeVisible();
    await expect(rang.getByRole("button", { name: "Remettre en attente", exact: true })).toBeVisible();
    await expect(rang.getByRole("button", { name: "Marquer comme contactée" })).toHaveCount(0);
    await expect(rang.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
    await expect
      .poll(async () => (await db.query<{ statut: string }>("select statut from public.liste_attente_agences where id = $1", [id])).rows[0]?.statut, {
        message: "Le clic doit changer le statut en base, pas seulement à l'écran.",
      })
      .toBe("contactee");
    const ligne = (
      await db.query<{ contactee_le: string | null }>("select contactee_le::text from public.liste_attente_agences where id = $1", [id])
    ).rows[0];
    expect(ligne.contactee_le).not.toBeNull();

    // L'export, avec la session de supervision : un CSV UTF-8 (BOM), en pièce jointe datée, qui porte l'agence.
    const reponse = await page.request.get("/admin/liste-attente/export");
    expect(reponse.status()).toBe(200);
    expect(reponse.headers()["content-type"]).toMatch(/^text\/csv/);
    expect(reponse.headers()["content-disposition"]).toMatch(/^attachment; filename="liste-attente-agences-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(reponse.headers()["cache-control"]).toBe("no-store");
    // Les octets bruts : un décodage texte consommerait la marque d'ordre des octets (EF BB BF) sans la montrer.
    const octets = await reponse.body();
    expect(Array.from(octets.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const csv = octets.toString("utf8");
    expect(csv).toContain("Date d'inscription;Agence;Contact;E-mail;Téléphone;Code postal;Lots gérés;Message;Statut;Contactée le");
    expect(csv).toContain(agence);
    expect(csv).toContain(`;${email};`);
    expect(csv).toContain(";Contactée;");

    // Sans session (contexte vide) : une redirection vers la connexion ou un 403, jamais le fichier.
    const anonyme = await browser.newContext();
    try {
      const refus = await anonyme.request.get(new URL("/admin/liste-attente/export", page.url()).toString(), { maxRedirects: 0 });
      expect([301, 302, 303, 307, 308, 403]).toContain(refus.status());
      expect(await refus.text()).not.toContain(agence);
    } finally {
      await anonyme.close();
    }

    expect(await debordementHorizontal(page)).toBe(0);
    await page.screenshot({ path: info.outputPath("console-liste-attente-mobile.png"), fullPage: true });
  } finally {
    if (id) await db.query("delete from public.liste_attente_agences where id = $1", [id]);
    await db.end();
  }
});
