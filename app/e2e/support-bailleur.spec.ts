import { test, expect } from "@playwright/test";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sansSyntheseAlertes } from "./aides";
import { baseApiFictive } from "./local/base-api-fictive";

test.use({storageState: path.join(__dirname, ".auth", "proprietaire.json")});

test("le bailleur retrouve la réponse apportée à sa demande par la supervision", async ({ page, browser }, info) => {
  baseApiFictive(process.env.SUPALOCAL_DB);
  const sujet = "Justificatif de la dépense " + randomUUID();
  const reponse = "Votre justificatif fictif est disponible dans le dossier de la dépense.";
  const admin = await browser.newContext({
    baseURL: info.project.use.baseURL,
    viewport: info.project.use.viewport,
    storageState: path.join(__dirname, ".auth", "superadmin.json"),
  });
  try {
    await sansSyntheseAlertes(page);
    await page.goto("/assistance");
    await page.getByLabel("Sujet", { exact: true }).fill(sujet);
    await page.getByLabel("Votre message").fill("Je souhaite retrouver le justificatif de ma dépense fictive.");
    await page.getByLabel("Le résultat attendu").fill("Retrouver le document.");
    await page.getByRole("button", { name: "Envoyer ma demande" }).click();
    const lien = page.getByRole("link", { name: "Consulter ma demande" });
    await expect(lien).toBeVisible();
    const suivi = await lien.getAttribute("href");
    const supervision = await admin.newPage();
    await sansSyntheseAlertes(supervision);
    await supervision.goto("/admin/retours");
    const dossier = supervision.locator("article").filter({has: supervision.getByRole("heading", {name:sujet, exact:true})});
    const decision = dossier.getByLabel("Décision", {exact:true});
    if (!(await decision.isVisible())) await dossier.getByText("Répondre et décider", {exact:true}).click();
    await decision.selectOption("resolu");
    await dossier.getByLabel("Réponse visible dans le suivi").fill(reponse);
    await dossier.getByRole("button", {name:"Enregistrer la décision"}).click();
    await expect(dossier.getByText("Résolu", {exact:true}).first()).toBeVisible();
    await supervision.reload();
    await dossier.getByText(/Historique des réponses/).click();
    await expect(dossier.getByText(reponse, {exact:true})).toBeVisible();
    await page.goto(suivi!);
    await expect(page.getByText(reponse, {exact:true})).toBeVisible();
  } finally {
    await admin.close();
  }
});
