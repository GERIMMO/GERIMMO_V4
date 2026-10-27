import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

/** Parcours UI hors ligne. Les preuves Auth sensibles sont exécutées séparément sur GoTrue réel. */
export async function terminerInscriptionLocale(page: Page, email: string, motDePasse: string, suite: string) {
  const dbUrl = process.env.SUPALOCAL_DB ?? "";
  if (!/^postgres(?:ql)?:\/\/[^@]*@127\.0\.0\.1:[0-9]{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(dbUrl)) throw new Error("Base API fictive locale requise");
  const db = new Client({ connectionString: dbUrl });
  await db.connect();
  let jeton: string;
  let type: string;
  try {
    await expect.poll(async () => (await db.query("select count(*)::int n from auth.one_time_tokens t join auth.users u on u.id=t.user_id where u.email=$1", [email])).rows[0].n).toBeGreaterThan(0);
    const { rows } = await db.query("select t.token_hash,t.token_type from auth.one_time_tokens t join auth.users u on u.id=t.user_id where u.email=$1 order by t.updated_at desc limit 1", [email]);
    jeton = rows[0].token_hash;
    type = rows[0].token_type === "confirmation_token" ? "signup" : "recovery";
  } finally { await db.end(); }
  await page.goto(`/auth/confirm?${new URLSearchParams({ token_hash: jeton, type, email, next: `/nouveau-mot-de-passe?suite=${encodeURIComponent(suite)}` })}`);
  await page.getByRole("button", { name: /Confirmer mon adresse|Choisir mon mot de passe|Continuer/ }).click();
  await expect(page).toHaveURL(/\/nouveau-mot-de-passe/);
  // Un invité crée son PREMIER mot de passe (audit final du 27/10, DRT-05) : « Mot de passe » et « Créer mon mot de
  // passe » ; une inscription ou une récupération gardent « Nouveau mot de passe » et « Changer le mot de passe ».
  await page.getByLabel(/^(Nouveau )?mot de passe$/i).fill(motDePasse);
  await page.getByLabel("Confirmation", { exact: true }).fill(motDePasse);
  await page.getByRole("checkbox", { name: /accepte les conditions/ }).check();
  await page.getByRole("button", { name: /^(Changer le|Créer mon) mot de passe$/ }).click();
  // Relevé du 23/10 (PRO-5) : le premier choix après la confirmation garde la session ouverte et mène à l'espace ou à
  // l'étape suivante — plus d'écran de connexion ni de « Mot de passe modifié. Connectez-vous… ». L'appelant attend
  // ensuite sa propre destination.
  await page.waitForURL((url) => !/^\/(nouveau-mot-de-passe|connexion)(\/|$)/.test(url.pathname), { timeout: 30_000 });
}
