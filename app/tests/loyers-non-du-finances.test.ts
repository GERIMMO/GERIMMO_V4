/**
 * Intégration de l'audit final (28/10) : loyers_calculs (20261028100100, statut « non_du » d'un terme postérieur à la
 * fin du bail) × loyers_ecrans (LOY-07 : estAEchoir, totauxEcheances, relancesDuMois). Un terme « non dû » n'est jamais
 * exigible, jamais à relancer pour lui-même, jamais compté « à échoir » ni dans le reste dû — même si sa date d'échéance
 * est à venir et même si la ligne portait un montant. La dette antérieure échue portée par sa ligne, elle, reste due.
 */
import { describe, expect, it } from "vitest";
import { estAEchoir, relancesDuMois, totauxEcheances } from "@/lib/finances";

const JOUR = "2026-10-28";
const nonDuAVenir = { montant_du: 0, montant_couvert: 0, statut: "non_du", date_echeance: "2026-11-05" };
const nonDuMontant = { montant_du: 710, montant_couvert: 0, statut: "non_du", date_echeance: "2026-10-05" };
const echu = { montant_du: 800, montant_couvert: 300, statut: "partiel", date_echeance: "2026-10-05" };
const aEchoir = { montant_du: 710, montant_couvert: 0, statut: "attendu", date_echeance: "2026-11-05" };

describe("terme « non dû » dans les chiffres et les relances", () => {
  it("n'est jamais à échoir, quelle que soit sa date", () => {
    expect(estAEchoir(nonDuAVenir, JOUR)).toBe(false);
    expect(estAEchoir({ ...nonDuAVenir, date_echeance: null }, JOUR)).toBe(false);
    expect(estAEchoir(aEchoir, JOUR)).toBe(true);
  });
  it("ne compte ni dans le demandé, ni dans le reste dû, ni dans l'à échoir", () => {
    expect(totauxEcheances([nonDuAVenir, nonDuMontant], JOUR)).toEqual({ demande: 0, regle: 0, resteDu: 0, aEchoir: 0 });
    expect(totauxEcheances([echu, aEchoir, nonDuMontant, nonDuAVenir], JOUR)).toEqual({ demande: 1510, regle: 300, resteDu: 500, aEchoir: 710 });
  });
  it("ne se relance jamais pour lui-même ; une dette antérieure échue portée par sa ligne reste à relancer", () => {
    const seul = relancesDuMois([nonDuMontant, nonDuAVenir], JOUR);
    expect(seul.aRelancer).toEqual([]);
    expect(seul.exigible).toBe(0);
    const avecDette = relancesDuMois([{ ...nonDuMontant, dette_anterieure_reste: 120.5 }], JOUR);
    expect(avecDette.aRelancer).toHaveLength(1);
    expect(avecDette.aRelancer[0]).toMatchObject({ resteExigible: 0, aEchoir: 0, detteAnterieure: 120.5 });
    expect(avecDette.exigible).toBe(120.5);
  });
});
