import { describe, expect, it } from "vitest";
import { avertissementsCoherenceLoyer as verifier } from "@/lib/coherence-loyer";
const bail = { encadrement_loyer: true, loyer_hc: 1200, loyer_reference: 20, loyer_reference_majore: 24, complement_loyer: 0, type: "nu" };
const codes = (b: Parameters<typeof verifier>[0], surface: unknown = 50) => verifier(b, surface).map(a => a.code);
describe("X08 — avertir sans modifier les montants", () => {
  it.each([false, null, undefined, "true"])("encadrement non explicitement activé (%s) : aucune alerte, même en zone tendue", encadrement => {
    const b = { ...bail, encadrement_loyer: encadrement, zone_tendue: true, loyer_hc: 99999 };
    expect(verifier(b, 50)).toEqual([]);
  });
  it("loyer au plafond : pas d’écart ; le loyer peut aussi être inférieur à la référence", () => {
    expect(verifier(bail, 50)).toEqual([]);
    expect(verifier({ ...bail, loyer_hc: 900 }, 50)).toEqual([]);
  });
  it("signale la base au-dessus du plafond mensuel au centime près", () => {
    expect(codes({ ...bail, loyer_hc: 1200.01 })).toContain("base_superieure");
  });
  it("le loyer HC comprend déjà le complément : ne pas compter deux fois celui-ci", () => {
    const donnees = Object.freeze({ ...bail, loyer_hc: 1300, complement_loyer: 100, complement_justification: "Terrasse exceptionnelle" });
    expect(verifier(donnees, 50)).toEqual([]);
    expect(donnees.loyer_hc).toBe(1300);
    expect(codes({ ...donnees, loyer_hc: 1300.01 })).toContain("base_superieure");
  });
  it("un complément avec une base inférieure au plafond ou sans justification est signalé", () => {
    expect(codes({ ...bail, complement_loyer: 100 })).toEqual(expect.arrayContaining(["base_inferieure_avec_complement", "complement_sans_justification"]));
  });
  it("un complément supérieur au loyer hors charges n’engendre pas un faux loyer de base négatif", () => {
    const r = codes({ ...bail, loyer_hc: 50, complement_loyer: 100, complement_justification: "Terrasse" });
    expect(r).toContain("complement_superieur");
    expect(r).not.toContain("base_inferieure_avec_complement");
  });
  it("référence majorée différente de +20 % : avertissement avec tolérance d’arrondi de 5 centimes par m²", () => {
    expect(codes({ ...bail, loyer_reference_majore: 25 })).toContain("reference_majoree");
    expect(codes({ ...bail, loyer_reference: 19.99, loyer_reference_majore: 24 })).not.toContain("reference_majoree");
    expect(codes({ ...bail, loyer_reference: 20.3, loyer_reference_majore: 24.4 })).not.toContain("reference_majoree");
  });
  it.each([null, 0, NaN, Infinity, "inconnue"])("surface habitable inutilisable (%s) : pas de plafond inventé", surface => {
    const r = codes({ ...bail, loyer_hc: 2000 }, surface);
    expect(r).toContain("surface_manquante");expect(r).not.toContain("base_superieure");
  });
  it("données monétaires manquantes ou en cours de saisie : pas de dépassement inventé", () => {
    expect(codes({ ...bail, loyer_reference: null })).toContain("references_manquantes");
    expect(codes({ ...bail, loyer_hc: "1200," })).toContain("loyer_incomplet");
    expect(codes({ ...bail, complement_loyer: "abc" })).not.toContain("base_superieure");
  });
  it("lit les décimales françaises et compare les centimes après multiplication de surface", () => {
    expect(verifier({ ...bail, loyer_hc: "1080,12", loyer_reference: "20", loyer_reference_majore: "24" }, "45,005")).toEqual([]);
  });
  it.each([{ chambre_id: "chambre" }, { type: "colocation_individuelle" }])("contrat individuel : contrôle manuel de l’ensemble, aucun plafond du logement attribué à la chambre", individuel => {
    const r = codes({ ...bail, ...individuel, loyer_hc: 5000 });
    expect(r).toContain("colocation_individuelle");expect(r).not.toContain("base_superieure");
  });
});
