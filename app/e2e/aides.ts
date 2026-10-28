import { expect, type Page } from "@playwright/test";

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
  const motif = new RegExp(`^/${prefixe}/([0-9a-f-]+)(?:/|$)`);
  const chemin = new URL(page.url()).pathname;
  if (chemin !== "/espaces" && !motif.test(chemin)) await page.goto("/espaces");
  // Deux issues réelles : redirection vers l'unique espace ou choix visible
  // entre plusieurs espaces. Aucun délai arbitraire ni rattrapage d'erreur.
  await page.waitForFunction(({ prefixe }) => {
    if (new RegExp(`^/${prefixe}/[0-9a-f-]+(?:/|$)`).test(location.pathname)) return true;
    return [...document.querySelectorAll<HTMLAnchorElement>(`main a[href*="/${prefixe}/"]`)]
      .some(a => a.getClientRects().length > 0 && getComputedStyle(a).visibility !== "hidden");
  }, { prefixe });
  if (!motif.test(new URL(page.url()).pathname)) {
    await page
      .locator(`main a[href*="/${prefixe}/"]:visible`)
      .first()
      .click();
  }
  await page.waitForURL(url => motif.test(url.pathname), { timeout: 20_000 });
  // Sur téléphone le menu latéral est masqué : la barre basse porte la
  // navigation. Attendre aussi le contenu de l'espace réellement affiché.
  await expect(page.locator(prefixe === "locataire" ? "nav.loc-menu, nav.coquille-basse" : "nav.coquille-menu, nav.coquille-basse").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  return new URL(page.url()).pathname.match(motif)![1];
}

export async function debordementHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}
