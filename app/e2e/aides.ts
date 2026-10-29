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

/** Entrer directement dans le parcours demandé : /espaces peut rediriger
 * encore après son arrivée dans l'URL, il ne faut pas l'interrompre par goto. */
export async function connecterVers(page: Page, email: string, motDePasse: string, destination: string) {
  await page.goto(`/connexion?suite=${encodeURIComponent(destination)}`);
  await page.locator("#email").fill(email);
  await page.locator("#mot-de-passe").fill(motDePasse);
  // La page de connexion efface ce marqueur à son montage.
  await page.evaluate(() => sessionStorage.setItem("gerimmo-synthese-alertes-vue", "1"));
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  const cible = new URL(destination, page.url());
  await page.waitForURL(url => (url.pathname === cible.pathname && url.search === cible.search)
    || (destination === "/espaces" && /^\/(agence|espace|locataire|proprietaire)\/[0-9a-f-]+(?:\/|$)/.test(url.pathname)), { timeout: 25000 });
}

// Entre dans un espace depuis /espaces : avec une seule adhésion, l'app
// redirige d'elle-même ; sinon on clique le premier lien VISIBLE de l'espace.
// Décision D27 : le propriétaire direct entre par « espace » (/espace/<id>), les
// agences et leurs agents par « agence » (/agence/<id>).
export async function entrerDansEspace(page: Page, prefixe: "agence" | "espace" | "locataire" | "proprietaire") {
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
