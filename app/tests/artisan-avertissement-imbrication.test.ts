/**
 * CI du 25/11/2026 (étape 22, parcours du report et de l'annulation par le locataire) : sur la fiche de mission,
 * l'avertissement « Le locataire a annulé le rendez-vous » était un paragraphe (`p`) qui portait le formulaire
 * « J'en prends acte », puis, une fois l'annulation lue, le paragraphe « Vous avez pris acte de l'annulation ».
 * Ni un formulaire ni un paragraphe ne peuvent se trouver dans un `p` : en lisant la page envoyée par le serveur,
 * le navigateur fermait le paragraphe avant eux. La page reçue ne correspondait plus à celle de React (erreur
 * d'hydratation n° 418) et toute la fiche était redessinée, bouton compris, au moment où l'artisan pouvait appuyer.
 *
 * Ce qui est gardé : l'avertissement de l'artisan est un bloc qui garde, une fois lu par un vrai navigateur, le
 * formulaire et le paragraphe qu'on y place.
 */
import { existsSync } from "node:fs";
import { chromium, type Browser } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Avertissement } from "@/app/artisan/ui";

const avecFormulaire = renderToStaticMarkup(
  createElement(
    Avertissement,
    null,
    "Le locataire a annulé le rendez-vous.",
    createElement("form", { className: "mt-3" }, createElement("button", { type: "submit" }, "J’en prends acte")),
  ),
);
const avecParagraphe = renderToStaticMarkup(
  createElement(Avertissement, null, "Le locataire a annulé le rendez-vous.", createElement("p", null, "Vous avez pris acte de l’annulation.")),
);

describe("Avertissement de l'artisan : un bloc, jamais un paragraphe", () => {
  it("l'élément rendu est un bloc qui porte le rôle d'alerte", () => {
    expect(avecFormulaire).toMatch(/^<div role="alert"/);
    expect(avecParagraphe).toMatch(/^<div role="alert"/);
  });
});

const chrome = [process.env.GERIMMO_CHROME, chromium.executablePath()].find((p) => p && existsSync(p));
describe.skipIf(!chrome)("Avertissement de l'artisan lu par un vrai navigateur", () => {
  let navigateur: Browser;
  beforeAll(async () => {
    navigateur = await chromium.launch({ executablePath: chrome, args: ["--no-sandbox"] });
  }, 60_000);
  afterAll(async () => {
    await navigateur?.close();
  });

  for (const [cas, html, contenu] of [
    ["le formulaire « J’en prends acte »", avecFormulaire, "form"],
    ["le paragraphe « Vous avez pris acte »", avecParagraphe, "p"],
  ] as const) {
    it(`${cas} reste dans l'avertissement`, async () => {
      const page = await navigateur.newPage();
      try {
        await page.setContent(`<!doctype html><html lang="fr"><body><main>${html}</main></body></html>`);
        // Le navigateur ne déplace rien : l'arbre lu est celui que React a écrit.
        expect(await page.locator(`[role="alert"] > ${contenu}`).count()).toBe(1);
        expect(await page.locator('[role="alert"]').count()).toBe(1);
      } finally {
        await page.close();
      }
    });
  }
});
