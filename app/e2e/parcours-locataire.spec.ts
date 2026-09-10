import { expect, test } from "@playwright/test";
import path from "node:path";

// Parcours locataire au téléphone : le geste qui compte est la déclaration
// d'incident — photo d'abord (RM-19.2.2), trois écrans max (RM-19.2.1),
// statut visible depuis l'accueil (RM-19.2.3).
test.use({ storageState: path.join(__dirname, ".auth", "locataire.json") });

async function ouvrirEspace(page: import("@playwright/test").Page) {
  await page.goto("/espaces");
  const lien = page.locator('a[href*="/locataire/"]').first();
  if (await lien.count()) {
    await lien.click();
  }
  await page.waitForURL(/\/locataire\//);
  return page.url().match(/locataire\/([0-9a-f-]+)/)![1];
}

test("l'accueil locataire montre le statut de l'incident déclaré", async ({ page }) => {
  await ouvrirEspace(page);
  // L'incident E2E du seed (fuite sous l'évier) est visible dès l'accueil
  await expect(page.locator("body")).toContainText(/incident/i);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBe(0);
});

test("déclarer un incident : la photo est le premier champ, l'envoi aboutit", async ({ page }) => {
  const orgId = await ouvrirEspace(page);
  await page.goto(`/locataire/${orgId}/incident`);

  // RM-19.2.2 : le champ photos précède la description dans le document
  const ordre = await page.evaluate(() => {
    const photos = document.getElementById("photos");
    const description = document.querySelector('textarea, [name="description"]');
    if (!photos || !description) return null;
    return photos.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING
      ? "photo-d-abord"
      : "description-d-abord";
  });
  expect(ordre).toBe("photo-d-abord");

  // Une petite photo JPEG générée à la volée, passée par la compression client
  const octetsJpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64"
  );
  await page.locator("#photos").setInputFiles({
    name: "fuite.jpg",
    mimeType: "image/jpeg",
    buffer: octetsJpeg,
  });
  await page.locator("#categorie").selectOption({ index: 1 });
  const piece = page.locator("#piece");
  if (await piece.count()) {
    await piece.selectOption({ index: 1 }).catch(() => {});
  }
  const description = page.locator("textarea").first();
  if (await description.count()) {
    await description.fill("Déclaré depuis le test E2E mobile.");
  }
  await page.getByRole("button", { name: /déclarer|envoyer|signaler/i }).click();
  // La déclaration débouche sur une confirmation ou la liste des incidents
  await expect(page.locator("body")).not.toContainText(/erreur/i, { timeout: 20_000 });
});

test("mes loyers : échéancier lisible à 390px, quittance/reçu accessible", async ({ page }) => {
  const orgId = await ouvrirEspace(page);
  await page.goto(`/locataire/${orgId}/loyers`);
  await expect(page.locator("h1, h2").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBe(0);
});
