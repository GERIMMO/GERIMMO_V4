import { expect, test } from "@playwright/test";

test("le simulateur attend le chargement avant d’accepter un changement de prix", async ({ page, context }) => {
  let liberer!: () => void;
  const attente = new Promise<void>(resolve => { liberer = resolve; });
  await context.route("**/*", async route => {
    if (route.request().resourceType() === "script") await attente;
    await route.continue();
  });
  try {
    await page.goto("/tarifs", { waitUntil: "commit" });
    const simulateur = page.getByRole("region", { name: "Simuler mon abonnement" });
    const curseur = simulateur.getByRole("slider");
    const annuel = simulateur.getByRole("button", { name: "Annuel" });
    await expect(curseur).toBeDisabled();
    await expect(annuel).toBeDisabled();
    await expect(simulateur.getByRole("button", { name: "Mensuel" })).toBeDisabled();
    await expect(simulateur.locator(".offre-prix")).toContainText("5,99");
    liberer();
    await expect(curseur).toBeEnabled();
    await curseur.press("ArrowRight");
    await curseur.press("ArrowRight");
    await expect(simulateur.locator("label")).toContainText("3");
    await expect(simulateur.locator(".offre-prix")).toContainText("9,97");
    await annuel.click();
    await expect(simulateur.locator(".offre-prix")).toContainText("99,70");
  } finally { liberer(); }
});
