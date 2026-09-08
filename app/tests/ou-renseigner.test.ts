import { describe, expect, it } from "vitest";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";

// « Où renseigner » (chantier documentaire 08/09) : chaque champ resté en
// libellé pointe l'écran où la donnée se saisit.
describe("lienPourManquant", () => {
  const org = "org-1";
  const liens = [
    { entite: "bail" as const, entiteId: "b1" },
    { entite: "personne" as const, entiteId: "p1" },
  ];

  it("l'identité de l'émetteur se corrige au profil de l'organisation", () => {
    expect(lienPourManquant("nom et prénom(s), ou dénomination", org, liens)?.href).toBe(
      "/agence/org-1/profil"
    );
    expect(lienPourManquant("domicile ou siège social", org, liens)?.href).toBe(
      "/agence/org-1/profil"
    );
    expect(lienPourManquant("commune", org, [])?.href).toBe("/agence/org-1/profil");
  });

  it("les personnes renvoient à leur fiche, le bail à la sienne", () => {
    expect(lienPourManquant("nom et prénom(s) du ou des locataires", org, liens)?.href).toBe(
      "/agence/org-1/personnes/p1"
    );
    expect(lienPourManquant("montant du loyer hors charges", org, liens)?.href).toBe(
      "/agence/org-1/baux/b1"
    );
    expect(lienPourManquant("jj/mm/aaaa", org, liens)?.href).toBe("/agence/org-1/baux/b1");
  });

  it("le logement pointe le lot quand il est rattaché, sinon le bail", () => {
    expect(
      lienPourManquant("adresse complète, étage, porte", org, [
        ...liens,
        { entite: "lot", entiteId: "l1" },
      ])?.href
    ).toBe("/agence/org-1/parc?sel=lot:l1");
    expect(lienPourManquant("adresse complète, étage, porte", org, liens)?.href).toBe(
      "/agence/org-1/baux/b1"
    );
  });

  it("sans repère, la personne rattachée reste le meilleur point d'entrée — sinon rien", () => {
    expect(lienPourManquant("référence", org, liens)?.href).toBe("/agence/org-1/personnes/p1");
    expect(lienPourManquant("référence", org, [])).toBeNull();
  });
});
