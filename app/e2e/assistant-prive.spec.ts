import { expect, test, type Page } from "@playwright/test";
import { connecterVers, debordementHorizontal, sansSyntheseAlertes } from "./aides";

// Ce scénario vient de se connecter : /espaces peut encore rediriger.
// Attendre cette arrivée sans lancer un second goto concurrent. Les autres
// scénarios conservent leur entrée habituelle et ses scripts d'initialisation.
async function attendreEspaceLocataireApresConnexion(page: Page) {
  const motif = /^\/locataire\/([0-9a-f-]+)(?:\/|$)/;
  await page.waitForFunction(() => /^\/locataire\/[0-9a-f-]+(?:\/|$)/.test(location.pathname)
    || [...document.querySelectorAll<HTMLAnchorElement>('main a[href*="/locataire/"]')]
      .some(a => a.getClientRects().length > 0 && getComputedStyle(a).visibility !== "hidden"));
  if (!motif.test(new URL(page.url()).pathname)) {
    await page.locator('main a[href*="/locataire/"]:visible').first().click();
  }
  await page.waitForURL(url => motif.test(url.pathname), { timeout: 20_000 });
  await expect(page.locator("nav.loc-menu, nav.coquille-basse").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  return new URL(page.url()).pathname.match(motif)![1];
}

for (const profil of [
  { role: "espace", email: "proprietaire@example.com", page: "messages" },
  { role: "locataire", email: "locataire.alpha@example.com", page: "contact" },
] as const) {
  test(`assistant privé ${profil.role} : entrée discrète et indisponibilité honnête sans fournisseur`, async ({ page }, testInfo) => {
    test.skip(process.env.E2E_CI !== "1" || Boolean(process.env.OPENAI_API_KEY || process.env.OPEN_AI_KEY) || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(process.env.E2E_BASE_URL ?? ""), "Banc local isolé sans clé fournisseur uniquement");
    await sansSyntheseAlertes(page);
    await connecterVers(page, profil.email, process.env.E2E_MOT_DE_PASSE ?? "Gerimmo-Demo-2026",
      profil.role === "espace" ? "/espace/3c1d1e95-3570-400b-8012-44530be145b1/messages" : "/espaces");
    if (profil.role === "locataire") {
      const orgId = await attendreEspaceLocataireApresConnexion(page);
      const lien = page.locator(`a[href="/locataire/${orgId}/contact"]`).filter({ visible: true });
      if (await lien.count() === 0) await page.getByRole("button", { name: "Menu", exact: true }).click();
      await lien.first().click();
      await expect(page).toHaveURL(new RegExp(`/locataire/${orgId}/contact$`));
    }
    const assistant = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: "Demander à Gerimmo" }) });
    await expect(assistant).toHaveCount(1);
    await expect(assistant).not.toHaveAttribute("open");
    await assistant.locator("summary").click();
    await expect(assistant.getByText(/Aucun dossier n’est joint automatiquement/)).toBeVisible();
    const question = assistant.getByLabel("Votre question", { exact: true });
    await question.fill("TEST fictif : comment comprendre mes charges ?");
    await assistant.getByRole("button", { name: "Envoyer à Gerimmo", exact: true }).click();
    await expect(assistant.getByRole("alert")).toContainText("n’est pas connecté");
    await expect(question).toHaveValue("TEST fictif : comment comprendre mes charges ?");
    await expect(assistant.getByRole("button", { name: "Envoyer à Gerimmo", exact: true })).toBeEnabled();
    expect(await debordementHorizontal(page)).toBe(0);
    await page.screenshot({ path: testInfo.outputPath(`assistant-prive-${profil.role}-${testInfo.project.name}.png`), fullPage: true });
    const avertissement = page.waitForEvent("dialog");
    const rechargement = page.reload();
    const dialogue = await avertissement;
    expect(dialogue.type()).toBe("beforeunload");
    await dialogue.accept();
    await rechargement;
    await assistant.locator("summary").click();
    await expect(question).toHaveValue("");
  });
}
