import { expect, test } from "@playwright/test";
import path from "node:path";
import { sansSyntheseAlertes } from "./aides";

// BOUTON D'ENVOI COMMUN — décision D30 B (fiche PR178-B-04 du 13/10/2026).
//
// Sur les formulaires protégés, l'envoi passe par une fonction du navigateur : avant la fin du chargement du script, un
// clic sur « Envoyer » ne faisait RIEN, sans un mot. `BoutonEnvoi` (plus de deux cents formulaires en dépendent) est
// donc désactivé dans le HTML du serveur, avec l'infobulle « La page finit de se charger. », et ne s'active qu'à
// l'hydratation (lib/use-hydrate.ts, useSyncExternalStore). Les formulaires que le navigateur sait envoyer seul
// (`envoiNatif`) n'attendent pas.
//
// POURQUOI UN PARCOURS AU NAVIGATEUR. Les tests sous vitest rendent le composant côté serveur (renderToStaticMarkup) :
// ils ne voient que « désactivé dans le HTML ». Le passage à « actif » après hydratation ne se voit qu'avec un vrai
// navigateur — si le crochet restait à « faux », tous les boutons d'envoi seraient inertes à vie et aucun test sous
// vitest ne rougirait (relecture du lot interface-a, mutation H1 ; tests/use-hydrate-navigateur.test.ts en garde
// maintenant la logique, ce parcours en garde la réalité). Un clic sur ces boutons, dans toute la suite, attend
// d'ailleurs qu'ils soient actifs : cette suite tombe aussi si l'hydratation n'active plus rien.
//
// Page témoin : l'aide du propriétaire (« Envoyer ma demande » est un BoutonEnvoi ordinaire, visible dès le HTML du
// serveur). Les boutons d'envoi des pages publiques sont tous `envoiNatif` : ils ne prouveraient rien ici. On passe par
// /assistance, que l'application oriente vers l'aide de l'espace du propriétaire, quelle que soit la racine de ses
// écrans (/agence, ou /espace après D27).

const SESSION = path.join(__dirname, ".auth", "proprietaire.json");
const PAGE = "/assistance";
const BOUTON = "Envoyer ma demande";
const AIDE = "La page finit de se charger.";
const SCRIPTS_DE_L_APPLICATION = /\/_next\/static\/.*\.js(\?.*)?$/;

test.describe("BoutonEnvoi commun : inerte jusqu'à l'hydratation, actif ensuite", () => {
  test.use({ storageState: SESSION });

  test.beforeEach(async ({ page }) => {
    await sansSyntheseAlertes(page);
  });

  test("script jamais chargé (HTML du serveur seul) : désactivé, avec l'infobulle qui dit pourquoi", async ({ page }) => {
    // Les scripts de l'application sont refusés : seul le HTML du serveur (et ses petits scripts de diffusion en flux,
    // qui dévoilent la page) s'exécute. Désactiver JavaScript en bloc laisserait la page à « Chargement… ».
    await page.route(SCRIPTS_DE_L_APPLICATION, (route) => route.abort());
    await page.goto(PAGE, { waitUntil: "load" });
    const bouton = page.getByRole("button", { name: BOUTON });
    await expect(bouton).toBeVisible();
    await expect(bouton).toBeDisabled();
    await expect(bouton).toHaveAttribute("title", AIDE);
    // Laissé le temps de s'activer s'il le pouvait : il reste inerte tant que React n'a pas pris la main.
    await page.waitForTimeout(1_500);
    await expect(bouton).toBeDisabled();
  });

  test("script chargé : le même bouton est actif, sans infobulle d'attente", async ({ page }) => {
    await page.goto(PAGE, { waitUntil: "load" });
    const bouton = page.getByRole("button", { name: BOUTON });
    await expect(bouton).toBeVisible();
    // L'hydratation active le bouton : sans elle, il resterait grisé et le test expirerait ici.
    await expect(bouton).toBeEnabled();
    await expect(bouton).not.toHaveAttribute("title", AIDE);
  });

  test("script retardé : inerte pendant le chargement, actif dès que la page est prête", async ({ page }) => {
    // Les scripts de la page arrivent avec 3 s de retard (téléphone modeste, réseau lent).
    await page.route(SCRIPTS_DE_L_APPLICATION, async (route) => {
      await new Promise((fini) => setTimeout(fini, 3_000));
      await route.continue();
    });
    await page.goto(PAGE, { waitUntil: "domcontentloaded" });
    const bouton = page.getByRole("button", { name: BOUTON });

    await expect(bouton).toBeVisible();
    await expect(bouton).toBeDisabled();
    await expect(bouton).toHaveAttribute("title", AIDE);

    await expect(bouton).toBeEnabled({ timeout: 20_000 });
    await expect(bouton).not.toHaveAttribute("title", AIDE);
  });
});

test.describe("un formulaire que le navigateur envoie seul n'attend pas la page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("« Envoyer le lien » (mot de passe oublié) est actif dès le HTML du serveur, sans script", async ({ browser }) => {
    const sansScript = await browser.newContext({ javaScriptEnabled: false });
    const page = await sansScript.newPage();
    await page.goto("/mot-de-passe-oublie", { waitUntil: "load" });
    const bouton = page.getByRole("button", { name: "Envoyer le lien" });
    await expect(bouton).toBeVisible();
    await expect(bouton).toBeEnabled();
    await expect(bouton).not.toHaveAttribute("title", AIDE);
    await sansScript.close();
  });
});
