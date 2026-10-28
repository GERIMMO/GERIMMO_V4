import { expect, test, type Page } from "@playwright/test";
import { debordementHorizontal } from "./aides";
import { terminerInscriptionLocale } from "./confirmation-locale";

/**
 * LA DOUBLE AUTHENTIFICATION ACTIVÉE EST EXIGÉE À CHAQUE CONNEXION (audit final du 27/10/2026, PUB-01).
 *
 * Un propriétaire activait son second facteur depuis « Mon compte » — « elle sera demandée à chaque connexion » — et
 * le mot de passe seul continuait d'ouvrir l'espace, les documents et « Mon compte » : le proxy ne lisait le niveau
 * d'assurance que pour la supervision. Désormais tout compte dont un facteur est vérifié passe par le sas /securite.
 *
 * La spec travaille sur un compte QU'ELLE CRÉE : un second facteur posé sur une persona partagée survivrait au test
 * et fermerait les autres fichiers.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const MOT_DE_PASSE = "recette-second-facteur-1";

async function creerUnCompte(page: Page): Promise<string> {
  const email = `delivered+recette-mfa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@resend.dev`;
  await page.goto("/inscription");
  await page.getByLabel("Prénom").fill("Camille");
  await page.getByLabel("Nom", { exact: true }).fill("Recette");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByRole("button", { name: /créer|inscrire|ouvrir/i }).first().click();
  await terminerInscriptionLocale(page, email, MOT_DE_PASSE, "/espaces");
  await page.waitForURL(/\/(agence|espace|espaces)/, { timeout: 30_000 });
  return email;
}

test("un propriétaire qui a activé sa double authentification passe par le sas à la reconnexion, avant tout écran", async ({ page, browser }) => {
  const { totp } = await import("./local/mfa-local.mjs");
  const email = await creerUnCompte(page);

  // 1. Activation depuis « Mon compte » (la clé plutôt que le QR : même secret).
  await page.goto("/compte");
  const carte = page.locator(".loc-carte", { hasText: "Double authentification" });
  await carte.getByRole("button", { name: "Activer la double authentification" }).click();
  await carte.getByText("Saisir une clé à la place du QR code").click();
  const secret = (await carte.locator("details p").first().innerText()).trim();
  await carte.getByLabel("Code à six chiffres").fill(totp(secret));
  await carte.getByRole("button", { name: "Activer", exact: true }).click();
  await expect(carte.getByRole("status")).toContainText(/demandée à chaque connexion/);

  // 2. Un navigateur neuf : le mot de passe seul mène au sas, pas à l'espace.
  const contexte = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const neuf = await contexte.newPage();
  await neuf.goto("/connexion");
  await neuf.getByLabel("Adresse e-mail").fill(email);
  await neuf.getByLabel("Mot de passe").fill(MOT_DE_PASSE);
  await neuf.getByRole("button", { name: /connexion|se connecter/i }).first().click();
  await neuf.waitForURL(/\/securite/, { timeout: 20_000 });
  await expect(neuf.getByRole("heading", { name: "Entrez le code de votre application" })).toBeVisible();
  await expect(neuf.getByText(/Vous avez activé la double authentification/)).toBeVisible();
  await expect(neuf.getByLabel("Code à six chiffres")).toBeVisible();
  expect(await debordementHorizontal(neuf)).toBe(0);

  // 3. Avant le code, aucune adresse privée ne s'ouvre : « Mon compte » et les espaces ramènent au sas.
  for (const adresse of ["/compte", "/espaces"]) {
    await neuf.goto(adresse);
    await neuf.waitForURL(/\/securite\?suite=/, { timeout: 20_000 });
    expect(new URL(neuf.url()).searchParams.get("suite")).toBe(adresse);
  }

  // 3 bis. Relecture adverse du 28/10 : retirer `factors` de la session du cookie (objet non signé) ne fait pas passer
  //        le sas — le proxy lit le facteur dans l'utilisateur vérifié par le serveur d'authentification.
  const fragments = (await contexte.cookies()).filter((k) => /^sb-.*-auth-token(\.\d+)?$/.test(k.name)).sort((a, b) => a.name.localeCompare(b.name));
  const nom = fragments[0].name.replace(/\.\d+$/, "");
  const brut = fragments.map((k) => k.value).join("");
  const session = JSON.parse(brut.startsWith("base64-") ? Buffer.from(brut.slice(7), "base64").toString() : decodeURIComponent(brut));
  expect((session.user?.factors ?? []).some((f: { status: string }) => f.status === "verified")).toBe(true);
  delete session.user.factors;
  const valeur = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const morceaux = valeur.match(/.{1,3180}/g)!;
  await contexte.clearCookies({ name: new RegExp(`^${nom}`) });
  await contexte.addCookies(morceaux.map((v, i) => ({ name: morceaux.length === 1 ? nom : `${nom}.${i}`, value: v, url: neuf.url() })));
  await neuf.goto("/compte");
  await neuf.waitForURL(/\/securite\?suite=%2Fcompte/, { timeout: 20_000 });

  // 4. Le code mène à la page demandée (« Mon compte »), qui montre la protection active, gestes de remplacement
  //    ouverts ; l'espace s'ouvre ensuite sans nouveau détour.
  await neuf.getByLabel("Code à six chiffres").fill(totp(secret));
  await neuf.getByRole("button", { name: "Vérifier et continuer" }).click();
  await neuf.waitForURL(/\/compte(\?|$)/, { timeout: 30_000 });
  const carteNeuve = neuf.locator(".loc-carte", { hasText: "Double authentification" });
  await expect(carteNeuve.getByText("active", { exact: true })).toBeVisible();
  await expect(carteNeuve.getByRole("button", { name: "Remplacer l’application" })).toBeVisible();
  await neuf.goto("/espaces");
  await neuf.waitForURL(/\/(espace|espaces|agence)(\/|\?|$)/, { timeout: 30_000 });
  expect(neuf.url()).not.toContain("/securite");
  await contexte.close();
});
