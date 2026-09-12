import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { entrerDansEspace, sansSyntheseAlertes } from "./aides";

// LE MENU DU COMPTE — demande de l'humain du 12/09 : « en bas à gauche j'ai les
// paramètres et la déconnexion… j'aimerais que ça soit un menu lorsque je clique
// sur l'avatar en haut à droite ».
//
// CE QUE CES TESTS PROTÈGENT, ET POURQUOI ILS EXISTENT.
//
// Ce menu porte désormais LE SEUL CHEMIN DE SORTIE de l'application. Avant lui,
// « Se déconnecter » vivait au pied de la barre latérale — qui disparaît sous
// 860 px — et il avait fallu greffer un second mécanisme (`SortieMobile`, trois
// icônes dans l'en-tête) pour qu'un téléphone puisse encore se déconnecter. Les
// deux mécanismes n'en font plus qu'un : si celui-ci casse, plus personne ne
// sort de sa session, à aucune largeur. D'où le test qui va jusqu'au bout du
// geste — cliquer, et vérifier qu'on est bien sorti — plutôt que de se
// contenter de voir le libellé.
//
// Toute la suite tourne à 390×844 tactile : c'est précisément la largeur où
// l'ancien chemin s'effaçait.

const PERSONAS = [
  { nom: "agent", etat: "agent.json", espace: "agence" as const, attendus: ["Profil de l'agence", "Mes espaces"] },
  { nom: "admin", etat: "admin.json", espace: "agence" as const, attendus: ["Profil de l'agence", "Mes espaces"] },
  { nom: "propriétaire", etat: "proprietaire.json", espace: "agence" as const, attendus: ["Mon profil", "Mes espaces"] },
  { nom: "locataire", etat: "locataire.json", espace: "locataire" as const, attendus: ["Mes espaces"] },
];

test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
});

function bouton(page: Page) {
  return page.getByRole("button", { name: /Mon compte/ });
}

for (const p of PERSONAS) {
  test.describe(`Côté ${p.nom}`, () => {
    test.use({ storageState: path.join(__dirname, ".auth", p.etat) });

    test("l'avatar ouvre le menu, et y met ce que ce rôle peut atteindre", async ({ page }) => {
      await entrerDansEspace(page, p.espace);

      const avatar = bouton(page);
      await expect(avatar).toBeVisible();
      // L'avatar n'était qu'une pastille décorative : il annonce maintenant
      // qu'il ouvre un menu, et dit quand il est ouvert.
      await expect(avatar).toHaveAttribute("aria-haspopup", "menu");
      await expect(avatar).toHaveAttribute("aria-expanded", "false");

      await avatar.click();
      await expect(avatar).toHaveAttribute("aria-expanded", "true");

      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      for (const libelle of p.attendus) {
        await expect(menu.getByRole("menuitem", { name: libelle })).toBeVisible();
      }
      await expect(menu.getByRole("menuitem", { name: "Se déconnecter" })).toBeVisible();
    });

    test("la cible de l'avatar fait au moins 44 px, et le volet reste dans l'écran", async ({ page }) => {
      await entrerDansEspace(page, p.espace);

      const cible = await bouton(page).boundingBox();
      expect(cible).not.toBeNull();
      expect(Math.round(cible!.width)).toBeGreaterThanOrEqual(44);
      expect(Math.round(cible!.height)).toBeGreaterThanOrEqual(44);

      await bouton(page).click();
      const volet = await page.getByRole("menu").boundingBox();
      expect(volet).not.toBeNull();
      // Ancré à droite : un volet qui dépasserait obligerait à faire défiler
      // la page pour lire « Se déconnecter ».
      const largeur = page.viewportSize()!.width;
      expect(volet!.x).toBeGreaterThanOrEqual(0);
      expect(Math.round(volet!.x + volet!.width)).toBeLessThanOrEqual(largeur);
    });

    test("Échap referme le menu et rend le clavier à l'avatar", async ({ page }) => {
      await entrerDansEspace(page, p.espace);
      await bouton(page).click();
      await expect(page.getByRole("menu")).toBeVisible();

      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);
      // Sans ce retour de focus, Échap laisserait le clavier au début du
      // document — on ne peut plus rouvrir le menu sans la souris.
      await expect(bouton(page)).toBeFocused();
    });

    test("se déconnecter depuis le menu sort vraiment de la session", async ({ page }) => {
      await entrerDansEspace(page, p.espace);
      await bouton(page).click();
      await page.getByRole("menuitem", { name: "Se déconnecter" }).click();

      // La session est révoquée côté serveur : revenir sur l'espace renvoie à
      // la connexion. On vérifie la CONSÉQUENCE, pas seulement l'atterrissage.
      await page.waitForURL(/\/(connexion|)$/, { timeout: 20_000 });
      await page.goto("/espaces");
      await expect(page).toHaveURL(/\/connexion/);
    });
  });
}

test.describe("Ce que le menu remplace", () => {
  test.use({ storageState: path.join(__dirname, ".auth", "agent.json") });

  test("le pied de barre latérale et la sortie de secours mobile ont disparu", async ({ page }) => {
    await entrerDansEspace(page, "agence");
    // Deux chemins pour un même geste, c'était un chemin de trop : le menu de
    // l'en-tête est là à TOUTES les largeurs, celle-ci comprise.
    await expect(page.locator(".loc-late-bas")).toHaveCount(0);
    await expect(page.locator(".loc-sortie-mobile")).toHaveCount(0);
  });
});
