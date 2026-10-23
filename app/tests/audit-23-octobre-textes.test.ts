// Audit du 23/10 (A06) : la page tarifs disait la signature électronique « pas
// encore proposée » alors que les circuits Zoho Sign sont ouverts (bail,
// documents, devis le 19/10 ; cautionnement le 21/10). Elle dit ce qui existe,
// sans promettre ni volume ni gratuité.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
