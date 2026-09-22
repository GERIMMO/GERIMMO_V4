import { describe, expect, it } from "vitest";
import { calculerDevis, montantEnCentimes } from "../src/lib/devis-structure";
const ligne = (v = {}) => ({ libelle: "Main-d’œuvre", quantite: 1.5, prix_unitaire_ht_cents: 4500, tva_bps: 2000, ...v });
describe("Détail financier d’un devis", () => {
  it("calcule prix, quantités et TVA par ligne", () => {
    expect(calculerDevis([ligne(), ligne({ libelle: "Joint", quantite: 2, prix_unitaire_ht_cents: 125, tva_bps: 550 })])).toMatchObject({ montant_ht_cents: 7000, montant_tva_cents: 1364, montant_ttc_cents: 8364 });
  });
  it("arrondit un demi-centime comme la base et conserve trois décimales de quantité", () => {
    expect(calculerDevis([ligne({ quantite: 0.005, prix_unitaire_ht_cents: 100, tva_bps: 0 })]).montant_ttc_cents).toBe(1);
    expect(calculerDevis([ligne({ quantite: 1.01, prix_unitaire_ht_cents: 100, tva_bps: 0 })]).montant_ttc_cents).toBe(101);
  });
  it.each([NaN, Infinity, -1, 0, 1.0001])("refuse une quantité invalide %s", quantite => expect(() => calculerDevis([ligne({ quantite })])).toThrow());
  it.each([NaN, Infinity, -1, 1.5, 1_000_000_001])("refuse un prix invalide %s", prix_unitaire_ht_cents => expect(() => calculerDevis([ligne({ prix_unitaire_ht_cents })])).toThrow());
  it("refuse prix total démesuré, tableau vide, TVA invalide et zéro total", () => {
    expect(() => calculerDevis([])).toThrow();
    expect(() => calculerDevis([ligne({ quantite: 1000000, prix_unitaire_ht_cents: 1_000_000_000 })])).toThrow();
    expect(() => calculerDevis([ligne({ tva_bps: 500 })])).toThrow();
    expect(() => calculerDevis([ligne({ prix_unitaire_ht_cents: 0 })])).toThrow();
  });
  it("lit les euros sans accepter notation exponentielle ou dépassement d’entier", () => {
    expect(montantEnCentimes("1 234,56 €")).toBe(123456);
    for (const valeur of ["1e2", "NaN", "Infinity", "-2", "10.333", "999999999999999999"]) expect(montantEnCentimes(valeur)).toBeNull();
  });
});
