// Audit du 23/10 (A06) : la page tarifs disait la signature électronique « pas
// encore proposée » alors que les circuits Zoho Sign sont ouverts (bail,
// documents, devis le 19/10 ; cautionnement le 21/10). Elle dit ce qui existe,
// sans promettre ni volume ni gratuité.
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/chrome-public", () => ({ EnTetePublic: () => null, PiedPublic: () => null }));
import PageTarifs from "../src/app/tarifs/page";

const page = fs.readFileSync(path.join(__dirname, "../src/app/tarifs/page.tsx"), "utf8");

describe("tarifs : disponibilité de la signature électronique", () => {
  it("ne dit plus la signature absente", () => {
    expect(page).not.toContain("n&apos;est pas encore proposée");
  });
  it("nomme les circuits ouverts et ne promet pas un volume illimité", () => {
    for (const circuit of ["du bail", "cautionnement", "acceptation des devis"]) expect(page).toContain(circuit);
    expect(page).toContain("n&apos;est pas illimitée");
    expect(page).not.toMatch(/signatures? illimitée|SMS illimités|gratuite?s?\b.*signature/i);
  });
});

// Relecture du 23/10 : la signature électronique, fournie avec l'abonnement, était rangée sous l'intertitre « Ce qui
// n'est pas dans l'abonnement ». Elle passe dans ce qui est inclus, avec les mêmes réserves de volume et de
// suspension, sans promesse de gratuité ; sous l'intertitre ne restent que les travaux, les SMS hors code de
// signature et les services bancaires. Le test lit la page RENDUE, intertitre par intertitre.
describe("tarifs : la signature électronique est rangée dans l'abonnement", () => {
  const articles = () => {
    const html = renderToStaticMarkup(createElement(PageTarifs)).replace(/&#x27;/g, "'");
    const parTitre = new Map<string, string>();
    for (const [, titre, corps] of html.matchAll(/<section[^>]*>\s*<h2[^>]*>([^<]*)<\/h2>([\s\S]*?)<\/section>/g)) {
      parTitre.set(titre, corps.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    }
    return parTitre;
  };

  it("« Ce qui n'est pas dans l'abonnement » ne parle plus de la signature électronique", () => {
    const hors = articles().get("Ce qui n'est pas dans l'abonnement");
    expect(hors).toBeDefined();
    expect(hors).not.toMatch(/signature électronique/i);
    expect(hors).toContain("Les travaux et interventions d'artisans");
    expect(hors).toContain("Aucun envoi de SMS en dehors du code de signature, aucun service bancaire.");
  });

  // Décisions du dirigeant du 23/10 (plan de conformité, lot 4) : la signature est comprise SANS SUPPLÉMENT, essai
  // compris, dans la limite du volume mensuel commun ; le cautionnement et l'état des lieux se signent dans Gerimmo.
  // Ni « gratuit » ni volume illimité pour autant.
  it("« Ce qui est dans l'abonnement » la nomme, avec ses réserves, sans supplément mais sans promettre ni gratuité ni volume", () => {
    const tous = articles();
    const inclus = tous.get("Ce qui est dans l'abonnement");
    expect(inclus).toBeDefined();
    for (const circuit of ["signature électronique du bail", "acte de cautionnement", "état des lieux", "acceptation des devis"]) {
      expect(inclus).toContain(circuit);
    }
    expect(inclus).toContain("code envoyé par SMS à chaque signataire");
    expect(inclus).toContain("sans supplément pour vous ni pour les signataires");
    expect(inclus).toContain("Elle n'est pas illimitée : elle dépend d'un volume mensuel commun et peut être momentanément suspendue.");
    expect(inclus).not.toMatch(/gratuit|illimitées?\s*(?:[.,;]|$)|à volonté/i);
    // L'article précède « Ce qui n'est pas dans l'abonnement ».
    const titres = [...tous.keys()];
    expect(titres.indexOf("Ce qui est dans l'abonnement")).toBeLessThan(titres.indexOf("Ce qui n'est pas dans l'abonnement"));
  });
});

// Audit du 23/10 (A07) : un seul point de départ pour la conservation des
// demandes du formulaire — le dernier traitement, ou le dépôt à défaut —
// comme le tableau de la page et la règle appliquée.
describe("confidentialité : un seul point de départ pour les demandes du formulaire", () => {
  const confidentialite = fs.readFileSync(path.join(__dirname, "../src/app/confidentialite/page.tsx"), "utf8");
  const formulaire = fs.readFileSync(path.join(__dirname, "../src/app/formulaire-devis-vitrine.tsx"), "utf8");
  it("ne compte plus depuis le seul dépôt", () => {
    expect(confidentialite).not.toContain("24 mois après leur dépôt");
    expect(confidentialite).toMatch(/24 mois\s+après leur dernier traitement/);
    expect(confidentialite).toContain("Dernier traitement ou dépôt si la demande n’a pas encore été traitée");
    expect(formulaire).toMatch(/24 mois après\s+le dernier traitement/);
  });
});
