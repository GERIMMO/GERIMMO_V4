import { describe, expect, it } from "vitest";
import { contexteDepenseSimple, natureFournisseur, valeursLectureFacture } from "../src/lib/contexte-depense-simple";

const eau = { fournisseur: "Eau de Lyon", categorie: "eau" as const, lot_id: null, actif: true };
const electricite = { fournisseur: "Engie", categorie: "electricite_commune" as const, lot_id: null, actif: true };

describe("préremplissage d'une dépense dans le bon périmètre", () => {
  it("reprend le seul fournisseur connu pour les parties communes", () => {
    expect(contexteDepenseSimple([eau], null)).toMatchObject({ fournisseur: "Eau de Lyon", categorie: "eau" });
  });
  it("ne choisit pas arbitrairement un fournisseur parmi plusieurs", () => {
    expect(contexteDepenseSimple([eau, electricite], null)).toMatchObject({ fournisseur: "", categorie: "" });
  });
  it("ne reprend ni le fournisseur d'un autre logement ni un contrat arrêté", () => {
    expect(contexteDepenseSimple([eau, { ...electricite, lot_id: "autre" }, { ...eau, actif: false }], "lot")).toEqual({ fournisseur: "", categorie: "", fournisseurs: [] });
  });
  it("reprend la nature après sélection d'un fournisseur, sans imposer la casse", () => {
    expect(natureFournisseur([eau, electricite], " ENGIE ")).toBe("electricite_commune");
  });
  it("demande de choisir la nature quand le même fournisseur couvre plusieurs usages", () => {
    expect(contexteDepenseSimple([electricite, { ...electricite, categorie: "gaz" }], null)).toMatchObject({ fournisseur: "Engie", categorie: "" });
  });
  it("ne garde pas la nature précédente pour un fournisseur inconnu", () => {
    expect(natureFournisseur([eau], "SFR")).toBe("");
  });
  it("ne confond pas le total d'un avis fiscal avec la ligne de taxe à vérifier", () => {
    expect(valeursLectureFacture({ total: "3500", frais_fixes: "100", frais_gestion: "40", reference: "Avis 2026", periode_debut: "2026-01-01" }, "teom")).toEqual({ reference: "Avis 2026", periode_debut: "2026-01-01" });
  });
  it("ne remplit que les informations lisibles et utiles à la facture", () => {
    expect(valeursLectureFacture({ total: "350", consommation: null, reference: "", fournisseur: "Devine", avertissements: ["À vérifier"] }, "electricite_commune")).toEqual({ total: "350" });
  });
});
