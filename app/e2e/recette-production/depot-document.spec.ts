import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pdfFictif } from "../pdf-fictif";
import { cliquer, debordementHorizontal, espaceDe, expect, test } from "./outils";

// Fichier exclusivement fictif, dans le parc du compte permanent de recette.
// Aucun destinataire, aucune signature, aucun paiement. Comme les autres pièces
// de recette, il est conservé jusqu'au nettoyage du prochain passage, qui garde
// les cinq identités. Aucune URL signée ni aucun contenu privé dans les artefacts.
test.use({ persona: "proprietaire" });

test("dépôt privé de 6 Mio et consultation complète sur téléphone", async ({ page }) => {
  const titre = `ESSAI transfert ${randomUUID()}`;
  const pdf = pdfFictif(6 * 1024 * 1024);
  await page.goto(`${espaceDe("proprietaire")}/documents?sel=depot`);
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Déposer", exact: true }) });
  await form.getByLabel("Type de document", { exact: true }).selectOption({ label: "Justificatif" });
  await form.getByLabel("Titre (facultatif)", { exact: true }).fill(titre);
  await form.locator('input[type="file"]').setInputFiles({ name: "essai-sans-engagement-six-mo.pdf", mimeType: "application/pdf", buffer: pdf });
  await cliquer(form.getByRole("button", { name: "Déposer", exact: true }));
  await expect(form.getByText("Document déposé.", { exact: true })).toBeVisible({ timeout: 60_000 });
  await cliquer(page.getByRole("link", { name: "← Tous les documents", exact: true }));
  await expect(page).toHaveURL(new RegExp("/documents$"));
  await page.reload();
  const document = page.getByRole("link").filter({ hasText: titre });
  await expect(document).toHaveCount(1);
  await cliquer(document);
  expect(await debordementHorizontal(page)).toBe(0);
  const consultation = page.getByRole("link", { name: `Consulter ${titre}`, exact: true });
  await expect(consultation).toBeVisible();
  const adresse = await consultation.getAttribute("href");
  expect(adresse).toBeTruthy();
  // Route de l'application : ses droits sont revérifiés avant l'accès signé.
  const reponse = await page.goto(adresse!);
  expect(reponse?.status()).toBe(200);
  expect(reponse?.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  await expect(page.getByRole("link", { name: "Ouvrir le PDF en plein écran" })).toBeVisible({ timeout: 60_000 });
  const telechargement = page.waitForEvent("download");
  await cliquer(page.getByRole("link", { name: "Télécharger", exact: true }));
  const chemin = await (await telechargement).path();
  expect(chemin).toBeTruthy();
  const fichier = await readFile(chemin!);
  expect(fichier.length).toBe(pdf.length);
  expect(createHash("sha256").update(fichier).digest("hex")).toBe(createHash("sha256").update(pdf).digest("hex"));
  expect(await debordementHorizontal(page)).toBe(0);
});
