import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Une nouvelle session du compte fictif, avec mot de passe puis TOTP réels du banc.
 * Les cookies sauvegardés au setup dépassent la limite d'inactivité de 30 minutes
 * dans une longue suite ; cette limite de production reste inchangée. */
export async function connecterSupervision(page: Page) {
  const api = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321");
  if (!["localhost", "127.0.0.1"].includes(api.hostname)) throw new Error("Auth de recette locale requise");
  await page.context().clearCookies();
  await page.goto("/connexion?suite=%2Fadmin%2Fbrief");
  await page.locator("#email").fill("superadmin@example.com");
  await page.locator("#mot-de-passe").fill(process.env.E2E_MOT_DE_PASSE ?? "Gerimmo-Demo-2026");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.waitForURL(/\/securite/);
  const { secret } = JSON.parse(readFileSync(path.join(__dirname, ".auth/superadmin-totp.json"), "utf8"));
  const { totp } = await import("./local/mfa-local.mjs");
  await page.getByLabel("Code à six chiffres").fill(totp(secret));
  await page.getByRole("button", { name: "Vérifier et continuer", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/brief/);
}
