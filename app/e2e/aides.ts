import type { Page } from "@playwright/test";

// La synthèse d'alertes s'ouvre à la première page de chaque session (le
// storageState ne porte pas le sessionStorage) et recouvrirait les gestes
// des specs : on la marque « déjà vue » — son propre mécanisme.
export async function sansSyntheseAlertes(page: Page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("gerimmo-synthese-alertes-vue", "1");
    } catch {}
  });
}

// Entre dans un espace depuis /espaces : avec une seule adhésion, l'app
// redirige d'elle-même ; sinon on clique le premier lien VISIBLE de l'espace.
export async function entrerDansEspace(page: Page, prefixe: "agence" | "locataire" | "proprietaire") {
  await page.goto("/espaces");
  const motif = new RegExp(`/${prefixe}/([0-9a-f-]+)`);
  try {
    await page.waitForURL(motif, { timeout: 6_000 });
  } catch {
    await page
      .locator(`main a[href*="/${prefixe}/"]:visible, a[href*="/${prefixe}/"]:visible`)
      .first()
      .click();
    await page.waitForURL(motif, { timeout: 20_000 });
  }
  return page.url().match(motif)![1];
}

export async function debordementHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}
