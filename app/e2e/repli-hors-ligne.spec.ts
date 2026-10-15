import { expect, test, type Page } from "@playwright/test";

// REPLI HORS LIGNE — décision D26 B (fiche DES-A-06 du 13/10/2026).
//
// Hors ligne, un clic sur un lien de l'application menait à la page d'erreur du navigateur (« No internet », en
// anglais), qui ne se corrigeait pas au retour du réseau. Le composant `RepliHorsLigne` (monté dans le gabarit racine)
// retient désormais ce clic AVANT que Next.js ne tente la navigation : on reste sur la page, une carte « Connexion
// perdue » s'ouvre avec « Réessayer » et « Fermer ». Aucun service worker.
//
// POURQUOI UN PARCOURS AU NAVIGATEUR. Le filtre « quel clic est retenu ? » est une fonction pure, testée sous vitest
// (tests/repli-hors-ligne.test.ts). Tout le reste est du câblage au navigateur — écoute du clic en phase de capture sur
// `window`, `preventDefault`, `navigator.onLine` lu au moment du clic, focus, Échap, écoute du retour du réseau,
// navigation après « Réessayer » — que le serveur de test ne voit pas : douze mutations de ce câblage survivaient à
// toute la suite vitest (relecture du lot interface-a). Ces parcours les attrapent.
//
// Page publique : le test n'a besoin d'aucune session ni d'aucune donnée.

test.use({ storageState: { cookies: [], origins: [] } });

const PAGE = "/connexion";
const LIEN = 'a[href="/mot-de-passe-oublie"]';
const DESTINATION = "/mot-de-passe-oublie";

declare global {
  interface Window {
    __marque?: string;
    __gardeAtteinte?: number;
  }
}

/** Ouvre la page de départ et attend que React ait pris la main (c'est là que l'écoute du clic est posée). */
async function ouvrir(page: Page) {
  await page.goto(PAGE, { waitUntil: "load" });
  const lien = page.locator(LIEN).first();
  await expect(lien).toBeVisible();
  await page.waitForFunction(
    (selecteur) => {
      const a = document.querySelector(selecteur);
      return !!a && Object.keys(a).some((cle) => cle.startsWith("__reactProps$"));
    },
    LIEN,
  );
  // Les effets passifs (l'écoute) partent après la peinture : une image et un tour de boucle suffisent.
  await page.evaluate(() => new Promise<void>((fini) => requestAnimationFrame(() => setTimeout(fini, 0))));
  // Deux repères posés dans la page : « marque » ne survit pas à un rechargement complet ; « garde » joue le rôle des
  // gardes de départ des formulaires (écoute du document, en phase montante), qui ne doivent pas voir un clic retenu.
  await page.evaluate(() => {
    window.__marque = "page-d-origine";
    window.__gardeAtteinte = 0;
    document.addEventListener("click", () => {
      window.__gardeAtteinte = (window.__gardeAtteinte ?? 0) + 1;
    });
  });
  return lien;
}

const carte = (page: Page) => page.getByRole("alert", { name: "Connexion perdue" });
const reessayer = (page: Page) => page.getByRole("button", { name: "Réessayer" });

test.describe("hors ligne, le clic sur un lien est retenu", () => {
  test("on reste sur la page, la carte « Connexion perdue » s'ouvre et le focus va sur « Réessayer »", async ({ page, context }) => {
    const lien = await ouvrir(page);
    await context.setOffline(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);

    await lien.click();

    // La carte est une alerte nommée par son titre (role="alert" + aria-labelledby).
    await expect(carte(page)).toBeVisible();
    await expect(carte(page)).toContainText("n’est plus connecté à Internet");
    await expect(carte(page)).toContainText("Vous restez sur cette page");
    await expect(reessayer(page)).toBeFocused();
    await expect(page.getByRole("button", { name: "Fermer" })).toBeVisible();
    // Le clic n'a mené nulle part : même adresse, même document (pas de page d'erreur du navigateur).
    await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
    expect(await page.evaluate(() => window.__marque)).toBe("page-d-origine");
    // …et il n'est pas arrivé jusqu'aux gardes de départ : retenu avant eux, en phase de capture.
    expect(await page.evaluate(() => window.__gardeAtteinte)).toBe(0);
  });

  test("« Réessayer » sans réseau le dit et laisse la carte ouverte", async ({ page, context }) => {
    const lien = await ouvrir(page);
    await context.setOffline(true);
    await lien.click();
    await expect(carte(page)).toBeVisible();

    await reessayer(page).click();

    await expect(carte(page)).toContainText("La connexion n’est pas revenue");
    await expect(carte(page)).not.toContainText("n’est plus connecté à Internet");
    await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
    expect(await page.evaluate(() => window.__marque)).toBe("page-d-origine");
  });

  test("« Échap » ferme la carte sans naviguer, et un nouveau clic la rouvre", async ({ page, context }) => {
    const lien = await ouvrir(page);
    await context.setOffline(true);
    await lien.click();
    await expect(carte(page)).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(carte(page)).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
    expect(await page.evaluate(() => window.__marque)).toBe("page-d-origine");

    await lien.click();
    await expect(carte(page)).toBeVisible();
    await expect(reessayer(page)).toBeFocused();
  });

  test("« Fermer » ferme la carte sans naviguer", async ({ page, context }) => {
    const lien = await ouvrir(page);
    await context.setOffline(true);
    await lien.click();
    await expect(carte(page)).toBeVisible();

    await page.getByRole("button", { name: "Fermer" }).click();

    await expect(carte(page)).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
  });

  test("quand le réseau revient, la carte l'annonce ; « Réessayer » ouvre alors la page demandée, dans l'application", async ({ page, context }) => {
    const lien = await ouvrir(page);
    await context.setOffline(true);
    await lien.click();
    await expect(carte(page)).toBeVisible();
    await expect(carte(page)).toContainText("n’est plus connecté à Internet");

    await context.setOffline(false);

    await expect(carte(page)).toContainText("La connexion est revenue");
    await reessayer(page).click();

    await expect(page).toHaveURL(new RegExp(`${DESTINATION}$`));
    await expect(carte(page)).toBeHidden();
    // Même site : navigation de l'application (le document n'est pas rechargé), pas un chargement complet.
    expect(await page.evaluate(() => window.__marque)).toBe("page-d-origine");
  });

  test("la perte du réseau, carte ouverte, est suivie : le message revient à « plus connecté »", async ({ page, context }) => {
    const lien = await ouvrir(page);
    await context.setOffline(true);
    await lien.click();
    await context.setOffline(false);
    await expect(carte(page)).toContainText("La connexion est revenue");

    await context.setOffline(true);

    await expect(carte(page)).toContainText("n’est plus connecté à Internet");
  });

  test("un lien vers un autre site est retenu aussi ; « Réessayer » le charge en entier une fois le réseau revenu", async ({ page, context }) => {
    // L'autre site est simulé : la suite ne sort jamais sur Internet.
    await context.route("https://autre-site.example/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><title>Autre site</title><p>Bonjour</p>" }),
    );
    await ouvrir(page);
    await page.evaluate(() => {
      const a = document.createElement("a");
      a.id = "lien-externe";
      a.href = "https://autre-site.example/page";
      a.textContent = "Un autre site";
      document.body.append(a);
    });
    await context.setOffline(true);

    await page.locator("#lien-externe").click();
    await expect(carte(page)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${PAGE}$`));

    await context.setOffline(false);
    await reessayer(page).click();

    await expect(page).toHaveURL("https://autre-site.example/page");
    // Chargement complet, pas une navigation interne vers un chemin de CE site.
    expect(await page.evaluate(() => window.__marque)).toBeUndefined();
  });
});

test.describe("tant que le réseau est là, ou quand le clic ne quitte pas la page, rien n'est retenu", () => {
  test("en ligne, le lien s'ouvre comme avant, sans carte", async ({ page }) => {
    const lien = await ouvrir(page);

    await lien.click();

    await expect(page).toHaveURL(new RegExp(`${DESTINATION}$`));
    await expect(carte(page)).toBeHidden();
    expect(await page.evaluate(() => window.__marque)).toBe("page-d-origine");
  });

  test("hors ligne, un lien d'ancre sur la même page n'est pas retenu", async ({ page, context }) => {
    await ouvrir(page);
    await page.evaluate(() => {
      const a = document.createElement("a");
      a.id = "ancre";
      a.href = `${location.pathname}#bas`;
      a.textContent = "Aller en bas";
      document.body.append(a);
    });
    await context.setOffline(true);

    await page.locator("#ancre").click();

    await expect(page).toHaveURL(new RegExp(`${PAGE}#bas$`));
    await expect(carte(page)).toBeHidden();
  });
});
