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

/** La liste propriétaire sélectionne d’abord le bâtiment, puis son logement. */
export async function lienLotProprietaire(page: Page, lot: string | RegExp = /Appartement T2/) {
  await page.getByRole("navigation", { name: "Vos biens", exact: true }).getByRole("link", { name: /Résidence des Lilas/ }).click();
  const liens = page.locator('#fiche-bien a[href*="/lots/"]');
  const lien = typeof lot === "string" ? liens.and(page.locator(`a[href$="/lots/${lot}"]`)) : liens.filter({ hasText: lot });
  return lien.first();
}

const CHAMP_RECHERCHE = "Nom, ville, email, SIRET ou référence";

/** Ouvre la fenêtre de recherche de la console depuis le point du matin et rend son champ. */
export async function ouvrirRecherche(page: Page) {
  await page.goto("/admin/brief");
  // Au téléphone (une seule barre, 25/09), la recherche vit dans le menu.
  // Sur la construction de production, un clic parti avant l'hydratation est
  // rejoué par React une fois la page vivante : le menu peut se refermer juste
  // après s'être ouvert. On rejoue donc toute la séquence — ouvrir le menu si
  // besoin, puis « Rechercher » — jusqu'à ce que le champ soit réellement là.
  // Le bouton du menu change de nom une fois ouvert (« Fermer le menu ») : on
  // le vise par ce qu'il commande.
  const menu = page.locator('button[aria-controls="menu-supervision"]');
  const champ = page.getByLabel(CHAMP_RECHERCHE);
  await expect(async () => {
    if ((await menu.isVisible()) && (await menu.getAttribute("aria-expanded")) !== "true") await menu.click();
    // Deux boutons portent ce nom (barre haute masquée au téléphone, entrée du menu) : le visible.
    await page.locator("button:visible", { hasText: /Rechercher/ }).first().click({ timeout: 1_000 });
    await expect(champ).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  return champ;
}

/** Attend le rendu final sans neutraliser les animations ni les règles axe. */
export async function attendreRenduStable(page: Page) {
  await page.evaluate(async () => {
    let garde: ReturnType<typeof setTimeout> | undefined;
    const rendu = async () => {
      await document.fonts.ready;
      for (;;) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        // Les indicateurs continus (pouls, chargement) ne terminent jamais.
        const finies = document.getAnimations().filter((animation) =>
          animation.playState !== "finished" &&
          Number.isFinite(animation.effect?.getComputedTiming().endTime),
        );
        if (!finies.length) return;
        await Promise.all(finies.map((animation) => animation.finished.catch(() => {})));
      }
    };
    try {
      await Promise.race([
        rendu(),
        new Promise<never>((_, reject) => {
          garde = setTimeout(() => reject(new Error("Rendu non stabilisé avant l’audit axe (5 s)")), 5_000);
        }),
      ]);
    } finally {
      clearTimeout(garde);
    }
  });
}
