/**
 * CHARGES AU FORFAIT : PLUS DE NUMÉRO D'ARTICLE DOUTEUX À L'ÉCRAN — audit palier 1 du 22/11/2026, P1-10 (relevé C14).
 *
 * L'écran des loyers écrivait « le forfait est définitif (loi 89-462, art. 23-1) ». L'audit a relevé cette référence
 * comme fausse, sur un extrait ; le texte officiel n'a pas pu être ouvert. Tant qu'il ne l'est pas, l'écran n'affiche
 * AUCUN numéro d'article à cet endroit : ni l'ancien, ni un autre que je n'aurais pas vérifié. La règle (forfait
 * définitif, jamais régularisé) vient du cahier (RM-3.9.8) et reste dite.
 *
 * Garde-fou sur la source, comme les autres textes d'écran tenus mot pour mot.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx", "utf8");
const affiche = source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "").replace(/&apos;/g, "'").replace(/\s+/g, " ");

describe("charges au forfait : la règle est dite, sans référence non vérifiée", () => {
  it("la phrase reste : aucune régularisation, forfait définitif", () => {
    expect(affiche).toContain("data-charges-forfait");
    expect(affiche).toContain("Charges au forfait : aucune régularisation n'est possible, le forfait est définitif.");
  });

  it("aucun numéro d'article n'accompagne cette phrase", () => {
    const debut = affiche.indexOf("data-charges-forfait");
    const phrase = affiche.slice(debut, debut + 220);
    expect(phrase).not.toMatch(/art\.?\s*\d|article\s+\d|loi\s+(?:n°\s*)?89-462/i);
  });

  it("la référence relevée comme fausse n'est plus affichée nulle part dans l'application", () => {
    for (const fichier of ["src/app/agence/[orgId]/baux/[bailId]/formulaire-loyers.tsx", "src/components/champs-bail.tsx", "src/app/locataire/[orgId]/faq/page.tsx"]) {
      const texte = readFileSync(fichier, "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(texte, fichier).not.toMatch(/art\.?\s*23-1/);
    }
  });
});
