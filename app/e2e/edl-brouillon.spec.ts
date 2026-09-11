import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { sansSyntheseAlertes } from "./aides";

// Cœur du module 19 (mobile) : la grille d'EDL garde la saisie sur l'appareil
// (RM-19.1.1), l'affiche via l'indicateur permanent (RM-19.1.6), survit à un
// rechargement, prévient avant fermeture (RM-19.1.7) et repart seule au
// retour du réseau (RM-19.1.2). Données : l'EDL d'entrée du bail E2E
// (seed-parcours), en brouillon, grille générée.
test.use({ storageState: path.join(__dirname, ".auth", "admin.json") });

test.beforeEach(async ({ page }) => {
  await sansSyntheseAlertes(page);
});

// Aller droit à la grille : son chemin est dans la matrice générée depuis la
// base locale (npm run e2e:matrice) — le sujet du spec est la grille, la
// navigation est couverte par les parcours.
function cheminGrille(): string {
  const matrice = JSON.parse(
    fs.readFileSync(path.join(__dirname, "matrice-ecrans.json"), "utf8"),
  ) as { path: string }[];
  const edl = matrice.find((e) => /\/edl\//.test(e.path));
  if (!edl) throw new Error("Pas d'écran EDL dans la matrice — lancer seed-parcours puis e2e:matrice");
  return edl.path;
}

async function ouvrirGrille(page: import("@playwright/test").Page) {
  await page.goto(cheminGrille());
  await expect(page.getByRole("status")).toBeVisible({ timeout: 20_000 });
  // La synthèse d'alertes peut recouvrir la grille à la connexion : on la ferme
  const fermer = page.getByRole("button", { name: "Fermer" });
  if (await fermer.count()) {
    await fermer.first().click().catch(() => {});
  }
}

test("saisie → brouillon local → rechargement → la saisie est toujours là", async ({ page }) => {
  await ouvrirGrille(page);
  const premierSelect = page.locator('select[name^="etat_"]').first();
  await premierSelect.selectOption("bon");
  const commentaire = page.locator('input[name^="commentaire_"]').first();
  await commentaire.fill("Testé hors ligne — rayure d'angle");
  // L'indicateur permanent passe en « à synchroniser »
  await expect(page.getByRole("status")).toContainText(/à synchroniser/);
  // Le brouillon part en localStorage (débobinage 400 ms)
  await page.waitForTimeout(700);

  await page.reload();
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.locator('select[name^="etat_"]').first()).toHaveValue("bon");
  await expect(page.locator('input[name^="commentaire_"]').first()).toHaveValue(
    "Testé hors ligne — rayure d'angle"
  );
  await expect(page.getByRole("status")).toContainText(/à synchroniser/);
});

test("hors ligne : l'indicateur l'annonce ; au retour du réseau la grille se synchronise seule", async ({ page, context }) => {
  await ouvrirGrille(page);
  const deuxieme = page.locator('select[name^="etat_"]').nth(1);
  await context.setOffline(true);
  await deuxieme.selectOption("usage");
  await page.waitForTimeout(700);
  // Tenter d'enregistrer hors ligne : l'app ne casse pas, elle l'annonce
  await page.getByRole("button", { name: "Enregistrer la grille" }).click();
  await expect(page.getByRole("status")).toContainText(/Hors ligne/);

  await context.setOffline(false);
  // L'événement online déclenche la synchronisation silencieuse
  await expect(page.getByRole("status")).toContainText(/Synchronisé/, { timeout: 20_000 });

  // La base a bien la valeur : un rechargement la montre sans brouillon
  await page.reload();
  await expect(page.locator('select[name^="etat_"]').nth(1)).toHaveValue("usage");
  await expect(page.getByRole("status")).toContainText(/Synchronisé/);
});
