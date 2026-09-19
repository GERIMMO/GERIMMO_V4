import { test as setup, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Ouvre une session par persona via le formulaire de connexion (le vrai flux)
// et enregistre l'état de session pour les specs. Comptes du seed de démo.
const COMPTES = [
  { nom: "agent", email: "agent.alpha@gerimmo-demo.fr" },
  { nom: "admin", email: "admin.alpha@gerimmo-demo.fr" },
  { nom: "locataire", email: "locataire.alpha@gerimmo-demo.fr" },
  { nom: "proprietaire", email: "proprietaire@gerimmo-demo.fr" },
  { nom: "superadmin", email: "superadmin@gerimmo-demo.fr" },
  // L'artisan est le seul persona dont l'adresse ne porte pas d'organisation :
  // son portail les réunit (RM-19.3.3). Il atterrit donc sur /artisan, jamais
  // sur /agence/<id>.
  { nom: "artisan", email: "artisan.alpha@gerimmo-demo.fr" },
];

const MOT_DE_PASSE = process.env.E2E_MOT_DE_PASSE ?? "Gerimmo-Demo-2026";
const DOSSIER = path.join(__dirname, ".auth");
const API_LOCALE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

/**
 * LE SAS DE SUPERVISION, FRANCHI COMME UN HUMAIN LE FRANCHIT.
 *
 * Le proxy renvoie tout compte `super_admin` vers /securite tant que sa session
 * n'est pas en aal2 — et les facteurs de l'émulateur vivent en mémoire, donc ils
 * repartent à zéro à chaque démarrage du banc. Sans ce passage, la session du
 * persona superadmin ne s'ouvrait jamais : le setup échouait, et AUCUNE spec ne
 * tournait (constat du 19/09). Les autres personas ne voient pas ce sas.
 */
async function franchirLeSasMfa(page: Page) {
  try {
    await page.waitForURL(/\/securite/, { timeout: 5_000 });
  } catch {
    return; // pas de sas : ce compte n'a pas d'accès de supervision
  }
  const { totp } = await import("./local/mfa-local.mjs");
  // Le magasin de facteurs de l'émulateur vit en mémoire et SURVIT au harnais :
  // sans remise à zéro, le deuxième passage du setup tombait sur le facteur du
  // premier, dont il n'a pas le secret, et restait bloqué devant « Entrez le
  // code ». Route de banc, jamais appelée par l'application.
  await fetch(`${API_LOCALE}/__banc/oublier-facteurs`, { method: "POST" }).catch(() => {});
  await page.reload();
  await page.getByRole("button", { name: "Configurer mon application" }).click();
  // On lit la clé plutôt que le QR : c'est le même secret, et un test ne sait
  // pas scanner une image.
  await page.getByText("Saisir une clé à la place du QR code").click();
  const secret = (await page.locator("details p").first().innerText()).trim();
  await page.getByLabel("Code à six chiffres").fill(totp(secret));
  await page.getByRole("button", { name: "Activer et continuer" }).click();
}

setup("sessions des personas", async ({ browser }) => {
  // Six connexions, dont une qui franchit le sas MFA, contre un serveur de dév
  // qui compile chaque écran à la première visite : les 60 s par défaut de la
  // suite ne suffisent pas, et le setup mourait à mi-parcours en emportant
  // toute la suite avec lui.
  setup.setTimeout(240_000);
  fs.mkdirSync(DOSSIER, { recursive: true });
  for (const compte of COMPTES) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/connexion");
    await page.locator("#email").fill(compte.email);
    await page.locator("#mot-de-passe").fill(MOT_DE_PASSE);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await franchirLeSasMfa(page);
    await page.waitForURL(/\/(espaces|agence|locataire|proprietaire|admin|artisan)/, {
      timeout: 20_000,
    });
    await expect(page.locator("body")).not.toContainText("Identifiants invalides");
    await context.storageState({ path: path.join(DOSSIER, `${compte.nom}.json`) });
    await context.close();
  }
});
