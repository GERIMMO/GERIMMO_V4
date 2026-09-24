import { expect, test, type Page } from "@playwright/test";
import { debordementHorizontal } from "./aides";

/**
 * SÉCURITÉ DU COMPTE — les deux gestes qu'on ne pouvait pas faire (19/09).
 *
 * Changer son mot de passe imposait un aller-retour par email, et remplacer son
 * second facteur n'était possible NULLE PART : le jour où le trousseau du
 * porteur du projet a perdu la clé TOTP, seule une intervention en base a pu
 * rouvrir son compte.
 *
 * La spec travaille sur un compte QU'ELLE CRÉE : changer le mot de passe d'une
 * persona partagée casserait les autres fichiers, et un second facteur posé sur
 * elle survivrait au test.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const ANCIEN = "recette-mot-de-passe-1";
const NOUVEAU = "recette-mot-de-passe-2";

async function creerUnCompte(page: Page): Promise<string> {
  const email = `recette-compte-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@exemple.test`;
  await page.goto("/inscription");
  await page.getByLabel("Prénom").fill("Camille");
  await page.getByLabel("Nom", { exact: true }).fill("Recette");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(ANCIEN);
  await page.getByLabel("Confirmer le mot de passe").fill(ANCIEN);
  await page.locator('input[name="cgu"]').check();
  await page.getByRole("button", { name: /créer|inscrire|ouvrir/i }).first().click();
  // L'émulateur confirme l'adresse d'emblée : la session existe, et /espaces
  // ouvre l'organisation du propriétaire avant de nous y emmener.
  await page.waitForURL(/\/(agence|espaces)/, { timeout: 30_000 });
  return email;
}

async function seConnecter(page: Page, email: string, motDePasse: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(motDePasse);
  await page.getByRole("button", { name: /connexion|se connecter/i }).first().click();
}

test("on change son mot de passe depuis son compte, et l'ancien ne vaut plus rien", async ({
  page,
}) => {
  const email = await creerUnCompte(page);

  await page.goto("/compte");
  await expect(page.getByRole("heading", { name: "Sécurité du compte" })).toBeVisible();
  expect(await debordementHorizontal(page)).toBe(0);

  // 1. Le mot de passe actuel est EXIGÉ, et vérifié : sans ce contrôle, un
  //    poste laissé déverrouillé une minute suffirait à voler le compte.
  await page.getByLabel("Mot de passe actuel").fill("ce-n-est-pas-le-bon");
  await page.getByLabel("Nouveau mot de passe").fill(NOUVEAU);
  await page.getByLabel("Confirmation").fill(NOUVEAU);
  await page.getByRole("button", { name: "Changer le mot de passe" }).click();
  // Ciblé par son texte, pas par son rôle : Next pose un `role="alert"`
  // permanent et vide (l'annonceur de routes) dans chaque page.
  await expect(page.getByText("Mot de passe actuel incorrect.")).toBeVisible();

  // 2. Avec le bon, le changement passe — et la session courante SURVIT :
  //    changer son mot de passe ne doit pas éjecter de l'écran où l'on est.
  await page.getByLabel("Mot de passe actuel").fill(ANCIEN);
  await page.getByLabel("Nouveau mot de passe").fill(NOUVEAU);
  await page.getByLabel("Confirmation").fill(NOUVEAU);
  await page.getByRole("button", { name: "Changer le mot de passe" }).click();
  await expect(page.getByText(/Mot de passe modifié/)).toBeVisible();
  await expect(page).toHaveURL(/\/compte/);

  // 3. Le nouveau mot de passe est bien celui qui ouvre la porte.
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await page.waitForURL(/\/connexion/);
  await seConnecter(page, email, ANCIEN);
  await expect(page.getByText("Identifiants invalides.")).toBeVisible();
  await seConnecter(page, email, NOUVEAU);
  await page.waitForURL(/\/(agence|espaces)/, { timeout: 30_000 });
});

test("on active puis on retire son second facteur sans l'aide de personne", async ({ page }) => {
  // Le calcul TOTP du banc, celui-là même que l'émulateur vérifie.
  const { totp } = await import("./local/mfa-local.mjs");

  await creerUnCompte(page);
  await page.goto("/compte");

  const carte = page.locator(".loc-carte", { hasText: "Double authentification" });
  await expect(carte.getByText("inactive")).toBeVisible();

  // 1. Activation : on lit la clé plutôt que le QR — c'est le même secret, et
  //    un test ne sait pas scanner une image.
  await carte.getByRole("button", { name: "Activer la double authentification" }).click();
  await carte.getByText("Saisir une clé à la place du QR code").click();
  const secret = (await carte.locator("details p").first().innerText()).trim();
  expect(secret).toMatch(/^[A-Z2-7]{16,}$/);

  await carte.getByLabel("Code à six chiffres").fill(totp(secret));
  await carte.getByRole("button", { name: "Activer", exact: true }).click();
  await expect(carte.getByText("active", { exact: true })).toBeVisible();
  await expect(carte.getByRole("status")).toContainText(/activée/i);

  // 2. Retrait : possible parce que la session vient de monter en aal2 — c'est
  //    tout l'ordre des gestes de cet écran. La confirmation est exigée : on ne
  //    retire pas sa protection d'un clic distrait.
  await carte.getByRole("button", { name: "Retirer la double authentification" }).click();
  await carte.getByRole("button", { name: "Confirmer le retrait" }).click();
  await expect(carte.getByText("inactive")).toBeVisible();
  await expect(carte.getByRole("button", { name: "Activer la double authentification" })).toBeVisible();
});
