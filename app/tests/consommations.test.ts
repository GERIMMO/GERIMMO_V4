import { describe, expect, it } from "vitest";
import { alertesContrats, autorisationRegularisation, consommationEntre, indexEnMillUnites, prorataOccupation, rapprocherConsommations, repartirCentimes } from "@/lib/consommations";

describe("consommations : montants exacts, anomalies explicites et absence de créance automatique", () => {
  it("préserve les trois décimales et la virgule française", () => {
    expect(indexEnMillUnites("123,004")).toBe(BigInt(123004));
    expect(consommationEntre("123.004", "123.006")).toBe(0.002);
  });
  it.each(["-1", "1.0001", "NaN", "Infinity", "1e3", "1234567890123"])('refuse un index ambigu %s', n => expect(() => indexEnMillUnites(n)).toThrow());
  it("ne transforme pas un index décroissant en consommation", () => expect(() => consommationEntre(150, 149)).toThrow(/inférieur/));
  it("partage tous les centimes une seule fois avec ordre déterministe", () => {
    expect(repartirCentimes(100, [{ id: "c", poids: 1 }, { id: "b", poids: 1 }, { id: "a", poids: 1 }])).toEqual([{ id: "c", cents: 33 }, { id: "b", cents: 33 }, { id: "a", cents: 34 }]);
  });
  it("préserve de grands produits entiers sans arrondi flottant", () => {
    expect(repartirCentimes(99999999999, [{ id: "a", poids: 999999999 }, { id: "b", poids: 999999998 }]).reduce((s, p) => s + p.cents, 0)).toBe(99999999999);
  });
  it("refuse une clé vide, négative ou des lignes en double", () => {
    expect(() => repartirCentimes(100, [{ id: "a", poids: 0 }])).toThrow();
    expect(() => repartirCentimes(100, [{ id: "a", poids: -1 }])).toThrow();
    expect(() => repartirCentimes(100, [{ id: "a", poids: 1 }, { id: "a", poids: 2 }])).toThrow();
  });
  it("borne le prorata aux dates d'occupation et couvre l'année bissextile", () => {
    expect(prorataOccupation("2024-02-01", "2024-02-29", "2024-02-15", "2024-02-20")).toEqual({ joursOccupes: 6, joursPeriode: 29 });
    expect(prorataOccupation("2024-02-01", "2024-02-29", "2024-03-01")).toEqual({ joursOccupes: 0, joursPeriode: 29 });
  });
  it("refuse les dates normalisées silencieusement par JavaScript", () => expect(() => prorataOccupation("2025-02-30", "2025-03-02", "2025-01-01")).toThrow());
  it("laisse l'écart du compteur général inexpliqué", () => {
    expect(rapprocherConsommations({ consommationFacturee: 120, periodeDebut: "2026-01-01", periodeFin: "2026-02-01", logements: [{ id: "a", indexDebut: 100, indexFin: 208, dateDebut: "2026-01-01", dateFin: "2026-02-01" }] })).toMatchObject({ ecart: 12, exacte: true, avertissements: [expect.stringContaining("n’est pas réparti")] });
  });
  it("signale des périodes décalées même lorsque les totaux semblent correspondre", () => {
    expect(rapprocherConsommations({ consommationFacturee: 10, periodeDebut: "2026-01-01", periodeFin: "2026-02-01", logements: [{ id: "a", indexDebut: 100, indexFin: 110, dateDebut: "2026-01-03", dateFin: "2026-02-03" }] }).exacte).toBe(false);
  });
  it("ne propose pas de régularisation pour un forfait, une électricité privée ou un bail non qualifié", () => {
    expect(autorisationRegularisation("forfait", "eau").autorisee).toBe(false);
    expect(autorisationRegularisation("provision", "electricite_privative").autorisee).toBe(false);
    expect(autorisationRegularisation(null, "eau").autorisee).toBe(false);
    expect(autorisationRegularisation("provision", "eau").autorisee).toBe(true);
  });
  it("n'alerte pas sur une facture payée", () => expect(alertesContrats([], [{ id: "f", payee_le: "2026-10-01", date_echeance: "2026-10-10" } as never], "2026-10-12")).toEqual([]));
});
