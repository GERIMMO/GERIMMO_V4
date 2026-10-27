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
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Déposer le document", exact: true }) });
  await form.getByLabel("Type de document", { exact: true }).selectOption({ label: "Justificatif" });
  await form.locator('input[type="file"]').setInputFiles({ name: "essai-sans-engagement-six-mo.pdf", mimeType: "application/pdf", buffer: pdf });
  await cliquer(form.locator("summary").filter({ hasText: "Renommer ou lier à une personne" }));
  await expect(form.getByLabel("Nom du document", { exact: true })).not.toHaveValue("");
  await form.getByLabel("Nom du document", { exact: true }).fill(titre);
  await cliquer(form.getByRole("button", { name: "Déposer le document", exact: true }));
  await expect(page.getByRole("status").filter({ hasText: "Document déposé." })).toBeVisible({ timeout: 60_000 });
  await cliquer(page.getByRole("link", { name: "Consulter le document", exact: true }));
  await expect(page).toHaveURL(new RegExp("/documents\\?sel="));
  await page.reload();
  expect(await debordementHorizontal(page)).toBe(0);
  const documentId = new URL(page.url()).searchParams.get("sel");
  expect(documentId).toBeTruthy();
  // La route recontrôle les droits ; sa lecture ne quitte pas la fiche.
  const reponse = await page.request.get(`${espaceDe("proprietaire")}/documents/${documentId}/fichier`);
  expect(reponse.status()).toBe(200);
  expect(reponse.headers()["x-frame-options"]).toBe("SAMEORIGIN");
  const apercu = page.getByRole("region", { name: `Aperçu : ${titre}`, exact: true });
  await expect(apercu.locator("canvas")).toBeVisible({ timeout: 60_000 });
  await expect(apercu.getByRole("button", { name: "Agrandir", exact: true })).toBeVisible();
  expect(page.context().pages()).toHaveLength(1);
  const telechargement = page.waitForEvent("download");
  await cliquer(apercu.getByRole("button", { name: "Télécharger", exact: true }));
  const chemin = await (await telechargement).path();
  expect(chemin).toBeTruthy();
  const fichier = await readFile(chemin!);
  expect(fichier.length).toBe(pdf.length);
  expect(createHash("sha256").update(fichier).digest("hex")).toBe(createHash("sha256").update(pdf).digest("hex"));
  expect(await debordementHorizontal(page)).toBe(0);
});
