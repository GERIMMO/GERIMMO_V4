import { Client } from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, saisir, cliquer, SANS_TRACE } from "./outils";
import { lireComptes } from "./cible";

// Compte neuf, mot de passe propre à la recette, courriers vers le puits de
// test Resend. Les liens à usage unique sont lus seulement pour CE compte,
// sans être affichés ni joints au rapport. On ne lit aucune boîte humaine.
// Le lien passe par Supabase puis revient dans Gerimmo avec le code PKCE,
// comme le lien du modèle par défaut. La remise dans une boîte humaine reste
// hors de cet essai : les boîtes resend.dev sont des puits de test.
test("inscription, confirmation et récupération d'un compte fictif", SANS_TRACE, async ({ page, context }) => {
  test.skip(!process.env.PGPASSWORD, "Lecture du seul lien de test réservée au chantier autonome.");
  test.setTimeout(240_000);
  const c = lireComptes();
  if (process.env.PGHOST !== "aws-0-eu-west-3.pooler.supabase.com"
    || process.env.PGUSER !== "postgres.rddlxunppddzpsaatdaz" || process.env.PGDATABASE !== "postgres"
    || !/^r[0-9]{6,20}-[0-9]{1,5}$/.test(c.suffixe)) throw new Error("Cible de recette refusée.");
  const email = `delivered+inscription-${test.info().retry}-${c.suffixe}@resend.dev`;
  const nom = `Recette-${c.suffixe}-${test.info().retry}`;
  // Autorité officielle Supabase, avec contrôle de la chaîne ET du nom d'hôte.
  // Source : Database Settings > SSL configuration > Download certificate.
  const db = new Client({ ssl: {
    ca: readFileSync(join(__dirname, "supabase-ca.crt"), "utf8"),
    rejectUnauthorized: true,
  } });
  await db.connect();
  try {
    await page.goto("/inscription");
    await saisir(page.getByLabel("Prénom", { exact: false }), "Camille");
    await saisir(page.getByLabel("Nom", { exact: true }), nom);
    await saisir(page.getByLabel("Adresse e-mail"), email);
    await saisir(page.getByLabel("Adresse postale", { exact: false }), "3 rue du Test");
    await saisir(page.getByLabel("Code postal", { exact: false }), "69003");
    await saisir(page.getByLabel("Ville", { exact: false }), "Lyon");
    await page.getByLabel("Mot de passe", { exact: true }).fill(c.motDePasse);
    await page.getByLabel("Confirmer le mot de passe").fill(c.motDePasse);
    await page.locator('input[name="cgu"]').check();
    await cliquer(page.getByRole("button", { name: "Ouvrir mon espace", exact: true }));
    await expect(page.getByText(/Vérifiez votre boîte mail/)).toBeVisible();

    const lien = async (colonne: "confirmation_token" | "recovery_token", type: "signup" | "recovery", next: string) => {
      let jeton = "";
      await expect(async () => {
        const r = await db.query(`select ${colonne} as token from auth.users where email=$1 and raw_user_meta_data->>'nom'=$2`, [email, nom]);
        jeton = r.rows[0]?.token ?? "";
        expect(Boolean(jeton), "un lien réservé au compte fictif est créé").toBe(true);
      }).toPass({ timeout: 20_000, intervals: [1000, 2000] });
      if (!/^pkce_[a-f0-9]{32,128}$/.test(jeton)) throw new Error("Le lien de test doit utiliser le parcours de confirmation PKCE.");
      const url = new URL("https://rddlxunppddzpsaatdaz.supabase.co/auth/v1/verify");
      url.searchParams.set("token", jeton);
      url.searchParams.set("type", type);
      url.searchParams.set("redirect_to", `https://www.gerimmo.app/auth/confirm?next=${next}`);
      try { await page.goto(url.toString()); } catch { throw new Error("Le lien de confirmation de recette n'a pas pu être ouvert."); }
      jeton = "";
    };
    await lien("confirmation_token", "signup", "/espaces");
    await page.waitForURL(/\/agence\/[a-f0-9-]{36}/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: /Bonjour/ })).toBeVisible();
    const r = await db.query("select email_confirmed_at is not null as confirme from auth.users where email=$1", [email]);
    expect(r.rows[0]?.confirme).toBe(true);

    // Nouveau contexte déconnecté ; le compte n'a jamais payé ni signé de bail.
    await context.clearCookies();
    // Les envois d'un même compte ont une limite de fréquence chez Supabase.
    await new Promise(resolve => setTimeout(resolve, 65_000));
    await page.goto("/mot-de-passe-oublie");
    await saisir(page.getByLabel("Adresse e-mail"), email);
    await cliquer(page.getByRole("button", { name: "Envoyer le lien", exact: true }));
    await expect(page.getByText(/Si un compte existe pour cette adresse/)).toBeVisible();
    await lien("recovery_token", "recovery", "/nouveau-mot-de-passe");
    await expect(page.getByLabel("Nouveau mot de passe")).toBeVisible();
    const nouveau = `${c.motDePasse}-nouveau`;
    await page.getByLabel("Nouveau mot de passe").fill(nouveau);
    await page.getByLabel("Confirmation", { exact: true }).fill(nouveau);
    await cliquer(page.getByRole("button", { name: "Changer le mot de passe", exact: true }));
    await page.waitForURL(/\/connexion\?raison=mot-de-passe-modifie/);
    await saisir(page.getByLabel("Adresse e-mail"), email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(c.motDePasse);
    await cliquer(page.getByRole("button", { name: "Se connecter", exact: true }));
    await expect(page.getByText("Identifiants invalides.")).toBeVisible();
    await saisir(page.getByLabel("Adresse e-mail"), email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(nouveau);
    await cliquer(page.getByRole("button", { name: "Se connecter", exact: true }));
    await page.waitForURL(/\/(agence|espaces)(\/|$|\?)/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  } finally {
    await db.end();
    // La suppression réelle des comptes/espaces relève de l'étape always du
    // chantier, même si la confirmation ou le navigateur échoue.
  }
});
