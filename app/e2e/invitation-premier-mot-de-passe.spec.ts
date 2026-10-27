import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { Client } from "pg";

/**
 * LE PREMIER MOT DE PASSE D'UN INVITÉ (audit final du 27/10/2026, DRT-05).
 *
 * Le lien d'invitation d'un locataire menait à « Accéder à votre compte », puis à « Nouveau mot de passe » et
 * « Changer le mot de passe », et la personne était déconnectée (« Mot de passe modifié. Connectez-vous… ») alors
 * qu'elle venait de créer son premier mot de passe. Désormais : « Votre mot de passe » → « Créez votre mot de passe »
 * → la page de l'invitation, connectée. Le courrier ne part pas sur le banc : le jeton est lu dans la base de l'API,
 * comme dans confirmation-locale.ts.
 */
test.use({ storageState: path.join(__dirname, ".auth", "proprietaire.json") });

const ORG = "3c1d1e95-3570-400b-8012-44530be145b1";

test("un locataire invité crée son mot de passe et arrive connecté sur son invitation", async ({ page, browser }) => {
  const url = process.env.SUPALOCAL_DB;
  test.skip(!url || !/^postgres(?:ql)?:\/\/[^@]*@127\.0\.0\.1:[0-9]{1,5}\/gerimmo_ci_[a-z_]+_api$/.test(url), "Base API fictive locale seulement");
  const db = new Client({ connectionString: url });
  await db.connect();
  const person = randomUUID();
  const email = `test-premier-mdp-${person}@example.invalid`;
  try {
    await db.query("insert into persons(id, organization_id, nom, prenom, email) values ($1, $2, 'TEST Premier mot de passe', 'Lou', $3)", [person, ORG, email]);

    // 1. Le propriétaire invite : le compte est créé, la marque du premier mot de passe posée par le service.
    await page.goto(`/espace/${ORG}/personnes/${person}#acces-locataire`);
    const carte = page.locator("#acces-locataire");
    await carte.getByRole("button", { name: "Inviter comme locataire", exact: true }).click();
    await expect(carte.getByText("En attente d’acceptation", { exact: true })).toBeVisible();
    const { rows: [invitation] } = await db.query("select id from invitations_locataires where person_id = $1 and etat = 'en_attente'", [person]);
    const marque = async () => (await db.query("select raw_app_meta_data ->> 'premier_mot_de_passe' m from auth.users where email = $1", [email])).rows[0]?.m;
    expect(await marque()).toBe("true");
    const { rows: [jeton] } = await db.query(
      "select t.token_hash from auth.one_time_tokens t join auth.users u on u.id = t.user_id where u.email = $1 and t.token_type = 'recovery_token'",
      [email],
    );
    expect(jeton).toBeTruthy();

    // 2. Le destinataire ouvre le lien dans un navigateur neuf.
    const contexte = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const invite = await contexte.newPage();
    const suite = `/invitations/${invitation.id}`;
    await invite.goto(`/auth/confirm?${new URLSearchParams({ token_hash: jeton.token_hash, type: "recovery", email, next: `/nouveau-mot-de-passe?suite=${encodeURIComponent(suite)}` })}`);
    await expect(invite.getByRole("heading", { name: "Votre mot de passe" })).toBeVisible();
    await expect(invite.getByText("Accéder à votre compte")).toHaveCount(0);
    await invite.getByRole("button", { name: "Choisir mon mot de passe", exact: true }).click();
    await expect(invite).toHaveURL(/\/nouveau-mot-de-passe/);
    await expect(invite.getByRole("heading", { name: "Créez votre mot de passe" })).toBeVisible();
    await expect(invite.getByText("Changer le mot de passe")).toHaveCount(0);
    await invite.getByLabel("Mot de passe", { exact: true }).fill("Locataire-Invite-2026!");
    await invite.getByLabel("Confirmation", { exact: true }).fill("Locataire-Invite-2026!");
    await invite.getByRole("button", { name: "Créer mon mot de passe", exact: true }).click();

    // 3. Connecté, sur son invitation — sans passer par la connexion ; la marque est effacée.
    await invite.waitForURL(new RegExp(`${suite.replace(/\//g, "\\/")}(\\?|$)`), { timeout: 30_000 });
    await expect(invite.getByRole("button", { name: "Accepter l’invitation", exact: true })).toBeVisible();
    expect(await marque()).toBe("false");
    await contexte.close();
  } finally {
    await db.query("begin; select set_config('gerimmo.systeme', 'on', true)");
    await db.query("delete from invitations_locataires where person_id = $1", [person]);
    await db.query("delete from persons where id = $1", [person]);
    await db.query("delete from auth.users where email = $1", [email]);
    await db.query("commit");
    await db.end();
  }
});
