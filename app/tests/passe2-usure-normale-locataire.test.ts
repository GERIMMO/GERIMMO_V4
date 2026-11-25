// Seconde passe complète (25/11/2026), défaut L-01 : sur la carte « Mon logement » du locataire, la phrase
// sur le dépôt de garantie se terminait par « l'usure normale déduite », accroché à « il vous est restitué » :
// lue simplement, elle disait que l'usure normale est retirée du dépôt rendu, l'inverse de la règle retenue
// (l'usure normale n'est pas imputable au locataire) et de la FAQ du même espace.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const lire = (chemin: string) => readFileSync(join(__dirname, "..", chemin), "utf8").replace(/\s+/g, " ");

describe("L-01 : l'usure normale n'est jamais présentée comme retenue sur le dépôt", () => {
  const logement = lire("src/app/locataire/[orgId]/logement/page.tsx");
  const faq = lire("src/app/locataire/[orgId]/faq/page.tsx");

  it("la carte « Mon logement » ne dit plus « l'usure normale déduite »", () => {
    expect(logement).not.toMatch(/usure normale déduite/);
    expect(logement).toContain("L&apos;usure normale du logement ne peut pas vous être retenue.");
  });

  it("la FAQ dit la même règle sans le mot « déduite »", () => {
    expect(faq).not.toMatch(/usure normale du logement est déduite/);
    expect(faq).toContain("L'usure normale du logement ne peut pas vous être facturée.");
  });
});
