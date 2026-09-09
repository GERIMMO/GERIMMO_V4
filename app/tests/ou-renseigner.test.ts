import { describe, expect, it } from "vitest";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";

// « Où renseigner » (chantier documentaire 08/09, refondu 09/09) : chaque
// champ resté en libellé pointe l'écran où la donnée se saisit. Les libellés
// testés sont les libellés RÉELS des modèles (audit 09/09 : les précédents
// étaient inventés et masquaient des faux routages).
describe("lienPourManquant", () => {
  const org = "org-1";
  const liens = [
    { entite: "bail" as const, entiteId: "b1" },
    { entite: "personne" as const, entiteId: "p1" },
  ];
  const avecLot = [...liens, { entite: "lot" as const, entiteId: "l1" }];

  it("l'en-tête de l'émetteur se corrige au profil de l'organisation", () => {
    expect(lienPourManquant("domicile ou siège social", org, liens)?.href).toBe(
      "/agence/org-1/profil"
    );
    expect(lienPourManquant("commune", org, [])?.href).toBe("/agence/org-1/profil");
    expect(lienPourManquant("adresse électronique", org, liens)?.href).toBe(
      "/agence/org-1/profil"
    );
  });

  it("l'état civil du locataire renvoie à sa fiche — y compris depuis un bail", () => {
    expect(lienPourManquant("commune de naissance", org, liens)?.href).toBe(
      "/agence/org-1/personnes/p1"
    );
    expect(lienPourManquant("nom et prénom(s) du ou des locataires", org, liens)?.href).toBe(
      "/agence/org-1/personnes/p1"
    );
    // Sur un bail, « adresse électronique » et la date par défaut désignent
    // les parties, pas l'en-tête
    expect(lienPourManquant("adresse électronique", org, liens, "bail_nu")?.href).toBe(
      "/agence/org-1/personnes/p1"
    );
    expect(lienPourManquant("jj/mm/aaaa", org, liens, "bail_nu")?.href).toBe(
      "/agence/org-1/personnes/p1"
    );
    expect(lienPourManquant("jj/mm/aaaa", org, liens)?.href).toBe("/agence/org-1/baux/b1");
  });

  it("l'identité du bailleur part vers les détentions (lot), jamais au profil", () => {
    expect(lienPourManquant("nom et prénom(s), ou dénomination", org, avecLot)?.href).toBe(
      "/agence/org-1/parc?sel=lot:l1"
    );
    expect(lienPourManquant("nom et prénom(s), ou dénomination", org, liens)?.href).toBe(
      "/agence/org-1/baux/b1"
    );
  });

  it("les conditions financières renvoient au bail", () => {
    expect(lienPourManquant("montant mensuel", org, liens)?.href).toBe("/agence/org-1/baux/b1");
    expect(lienPourManquant("dernier loyer du précédent locataire", org, liens)?.href).toBe(
      "/agence/org-1/baux/b1"
    );
    expect(lienPourManquant("à échoir ou échu", org, liens)?.href).toBe("/agence/org-1/baux/b1");
    expect(lienPourManquant("ex. 2e trimestre 2026", org, liens)?.href).toBe(
      "/agence/org-1/baux/b1"
    );
  });

  it("le logement pointe le lot quand il est rattaché, sinon le bail", () => {
    expect(lienPourManquant("adresse complète, étage, porte", org, avecLot)?.href).toBe(
      "/agence/org-1/parc?sel=lot:l1"
    );
    expect(lienPourManquant("adresse complète, étage, porte", org, liens)?.href).toBe(
      "/agence/org-1/baux/b1"
    );
    expect(lienPourManquant("en m²", org, avecLot)?.href).toBe("/agence/org-1/parc?sel=lot:l1");
    expect(lienPourManquant("nombre", org, avecLot)?.href).toBe("/agence/org-1/parc?sel=lot:l1");
    expect(lienPourManquant("cuisine équipée, sanitaires, placards…", org, avecLot)?.href).toBe(
      "/agence/org-1/parc?sel=lot:l1"
    );
  });

  it("sans repère, la personne rattachée reste le meilleur point d'entrée — sinon rien", () => {
    expect(lienPourManquant("référence", org, liens)?.href).toBe("/agence/org-1/personnes/p1");
    expect(lienPourManquant("référence", org, [])).toBeNull();
  });
});
