import { Client } from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, saisir, cliquer, SANS_TRACE } from "./outils";
import { lireComptes } from "./cible";

// Compte neuf, mot de passe propre à la recette, courriers vers le puits de
// test Resend. Les liens à usage unique sont lus seulement pour CE compte,
// sans être affichés ni joints au rapport. On ne lit aucune boîte humaine.
// Depuis le 30/09, la confirmation d'inscription ET la récupération sont des
// liens fabriqués par Gerimmo (auth.admin.generateLink) :
// /auth/confirm?token_hash=…&type=signup|recovery, qui mènent à un bouton ;
// c'est le clic qui consomme le jeton, dans n'importe quel navigateur. La
// base garde l'empreinte du jeton (confirmation_token / recovery_token) :
// exactement le `token_hash` que porte l'e-mail. La remise dans une boîte
// humaine reste hors de cet essai : les boîtes resend.dev sont des puits de
// test.
test.use({ actionTimeout: 20_000 });

test("inscription, confirmation et récupération d'un compte fictif", SANS_TRACE, async ({ page, context }) => {
  test.skip(!process.env.PGPASSWORD, "Lecture du seul lien de test réservée au chantier autonome.");
  test.setTimeout(240_000);
  const c = lireComptes();
  if (process.env.PGHOST !== "aws-0-eu-west-3.pooler.supabase.com"
    || process.env.PGUSER !== "postgres.rddlxunppddzpsaatdaz" || process.env.PGDATABASE !== "postgres"
    || !/^r[0-9]{6,20}-[0-9]{1,5}$/.test(c.suffixe)) throw new Error("Cible de recette refusée.");
  // L'essai de création doit rester neuf ; il est distinct des cinq comptes conservés.
  const suffixeInscription = process.env.RECETTE_COMPTES_FIXES === "1" ? `i${c.suffixe}` : c.suffixe;
  const email = `delivered+inscription-${test.info().retry}-${suffixeInscription}@resend.dev`;
  const nom = `Recette-${suffixeInscription}-${test.info().retry}`;
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
    // L'adresse est confirmée avant le choix du mot de passe et des conditions.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('input[name="cgu"]')).toHaveCount(0);
    await cliquer(page.getByRole("button", { name: "Ouvrir mon espace", exact: true }));
    await expect(page.getByText(/Vérifiez votre boîte mail/)).toBeVisible();

    // Le jeton est l'empreinte que `generateLink` a posée en base : exactement
    // le `token_hash` que porte l'e-mail de Gerimmo. Un jeton `pkce_…` dirait
    // que l'ancien parcours (Supabase envoie) est revenu : refus.
    const lien = async (colonne: "confirmation_token" | "recovery_token", type: "signup" | "recovery", next: string, bouton: string) => {
      let empreinte = "";
      await expect(async () => {
        const r = await db.query(`select ${colonne} as token from auth.users where email=$1 and coalesce(raw_user_meta_data->'profil_a_confirmer'->>'nom', raw_user_meta_data->>'nom')=$2`, [email, nom]);
        empreinte = r.rows[0]?.token ?? "";
        expect(/^[a-f0-9]{56}$/.test(empreinte), `un lien ${type} fabriqué par Gerimmo est créé pour le compte fictif`).toBe(true);
      }).toPass({ timeout: 20_000, intervals: [1000, 2000] });
      await page.goto(`/auth/confirm?${new URLSearchParams({ token_hash: empreinte, type, email, next })}`);
      empreinte = "";
      // La page du bouton : le jeton n'a pas été consommé à l'ouverture.
      await cliquer(page.getByRole("button", { name: bouton, exact: true }));
    };
    await lien("confirmation_token", "signup", "/espaces", "Confirmer mon adresse");
    await expect(page).toHaveURL(/\/nouveau-mot-de-passe/);
    await expect(page.getByLabel("Vous utilisez Gerimmo pour")).toHaveValue("proprietaire_direct");
    await expect(page.getByLabel("Nom", { exact: true })).toHaveValue(nom);
    await expect(page.getByLabel("Prénom", { exact: true })).toHaveValue("Camille");
    await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(c.motDePasse);
    await page.getByLabel("Confirmation", { exact: true }).fill(c.motDePasse);
    await page.getByRole("checkbox", { name: /accepte les conditions/ }).check();
    // Audit final (UX-06) : à la première confirmation, le bouton dit « Choisir mon mot de passe ».
    await cliquer(page.getByRole("button", { name: "Choisir mon mot de passe", exact: true }));
    // Relevé du 23/10 (PRO-5) : le premier choix garde la session ouverte et mène droit à l'espace, sans repasser par
    // la connexion. Décision D27 : l'espace du propriétaire direct qui vient de s'inscrire est /espace/<id>.
    await page.waitForURL(/\/espace\/[a-f0-9-]{36}/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { level: 1, name: /Bonjour/ })).toBeVisible();
    // Le mot de passe choisi ouvre bien le compte : contexte déconnecté, puis connexion avec lui.
    await context.clearCookies();
    await page.goto("/connexion");
    await saisir(page.getByLabel("Adresse e-mail", { exact: true }), email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(c.motDePasse);
    await cliquer(page.getByRole("button", { name: "Se connecter", exact: true }));
    await page.waitForURL(/\/espace\/[a-f0-9-]{36}/, { timeout: 30_000 });
    const r = await db.query("select email_confirmed_at is not null as confirme from auth.users where email=$1", [email]);
    expect(r.rows[0]?.confirme).toBe(true);

    // Nouveau contexte déconnecté ; le compte n'a jamais payé ni signé de bail.
    await context.clearCookies();
    await page.goto("/mot-de-passe-oublie");
    await saisir(page.getByLabel("Adresse e-mail"), email);
    await cliquer(page.getByRole("button", { name: "Envoyer le lien", exact: true }));
    await expect(page.getByText(/Si un compte existe pour cette adresse/)).toBeVisible();
    await lien("recovery_token", "recovery", "/nouveau-mot-de-passe", "Choisir mon mot de passe");
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
    await page.waitForURL(/\/(espace|espaces)(\/|$|\?)/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  } finally {
    await db.end();
    // La suppression réelle des comptes/espaces relève de l'étape always du
    // chantier, même si la confirmation ou le navigateur échoue.
  }
});
