/**
 * Relectures du chantier « loyers — écrans et textes » (audit final du 27/10).
 *  · LOY-07, page Loyers de l'agence : la tuile et la carte « Impayés à relancer » comptent la même liste ; un terme à échoir
 *    ne se relance pas pour lui-même, seulement pour la dette antérieure échue qu'il porte.
 *  · LOY-21 : la synthèse d'alertes fermée l'est pour un compte, dans l'onglet comme pour la journée.
 */
import { describe, expect, it } from "vitest";
import { accordMontant, relancesDuMois, totauxEcheances } from "@/lib/finances";
import { syntheseDejaVue, valeurJourSynthese, valeurOngletSynthese } from "@/lib/synthese-alertes-vue";

const JOUR = "2026-10-28";
describe("LOY-07 : relances exigibles de la page Loyers de l'agence", () => {
  it("acompte sur un terme à échoir (statut « partiel », échéance future), sans dette antérieure : rien à relancer, 500 € à échoir", () => {
    const r = relancesDuMois([{ montant_du: 700, montant_couvert: 200, statut: "partiel", date_echeance: "2026-11-05", dette_anterieure_reste: null }], JOUR);
    expect(r.aRelancer).toEqual([]);
    expect(r.exigible).toBe(0);
    expect(totauxEcheances([{ montant_du: 700, montant_couvert: 200, statut: "partiel", date_echeance: "2026-11-05" }], JOUR)).toMatchObject({ resteDu: 0, aEchoir: 500 });
  });
  it("acompte sur un terme à échoir avec une dette antérieure échue de 400 € : 1 à relancer, 400 € exigibles, 500 € à échoir", () => {
    const r = relancesDuMois([{ montant_du: 700, montant_couvert: 200, statut: "partiel", date_echeance: "2026-11-05", dette_anterieure_reste: 400 }], JOUR);
    expect(r.aRelancer).toHaveLength(1);
    expect(r.aRelancer[0]).toMatchObject({ resteExigible: 0, aEchoir: 500, detteAnterieure: 400 });
    expect(r.exigible).toBe(400);
  });
  it("le chiffre exigible additionne termes échus et dettes antérieures, au centime", () => {
    const r = relancesDuMois([
      { montant_du: "700.10", montant_couvert: 0, statut: "impaye", date_echeance: "2026-10-01", dette_anterieure_reste: "0.07" },
      { montant_du: 700, montant_couvert: 0, statut: "impaye", date_echeance: JOUR, dette_anterieure_reste: null },
    ], JOUR);
    expect(r.exigible).toBe(700.17);
    expect(r.aRelancer).toHaveLength(1);
  });
  it("accord après un montant : singulier en dessous de 2", () => {
    expect([0.01, 1.99, 2, 1100].map((m) => accordMontant(m, "reste", "restent"))).toEqual(["reste", "reste", "restent", "restent"]);
  });
  it("un terme seul « attendu » : rien à relancer", () => {
    const r = relancesDuMois([{ montant_du: 700, montant_couvert: 0, statut: "attendu", dette_anterieure_reste: null }], JOUR);
    expect(r.aRelancer).toEqual([]);
    expect(r.detteAnterieure).toBe(0);
  });
  it("un terme « attendu » qui porte une dette antérieure échue : 1 à relancer, pour la dette seule, le terme à échoir", () => {
    const r = relancesDuMois([{ montant_du: 700, montant_couvert: 0, statut: "attendu", dette_anterieure_reste: "400.00" }], JOUR);
    expect(r.aRelancer).toHaveLength(1);
    expect(r.aRelancer[0]).toMatchObject({ resteExigible: 0, aEchoir: 700, detteAnterieure: 400 });
    expect(r.detteAnterieure).toBe(400);
  });
  it("un terme impayé échu se relance pour son reste ; un terme réglé ne se relance pas", () => {
    const r = relancesDuMois([
      { montant_du: 700, montant_couvert: 300, statut: "partiel", dette_anterieure_reste: null },
      { montant_du: 500, montant_couvert: 500, statut: "paye", dette_anterieure_reste: 0 },
      { montant_du: "0.30", montant_couvert: "0.10", statut: "impaye", dette_anterieure_reste: "0.10" },
    ], JOUR);
    expect(r.aRelancer.map((x) => [x.resteExigible, x.aEchoir, x.detteAnterieure])).toEqual([[400, 0, 0], [0.2, 0, 0.1]]);
    expect(r.detteAnterieure).toBe(0.1);
  });
});

describe("LOY-21 : synthèse d'alertes déjà vue, par compte", () => {
  const jour = "2026-10-28";
  it("fermée par le compte A : vue pour A dans l'onglet et pour la journée", () => {
    expect(syntheseDejaVue({ onglet: valeurOngletSynthese("A"), journee: null, compteId: "A", jour })).toBe(true);
    expect(syntheseDejaVue({ onglet: null, journee: valeurJourSynthese("A", jour), compteId: "A", jour })).toBe(true);
  });
  it("un compte B dans le même onglet ou le même navigateur voit sa propre synthèse", () => {
    expect(syntheseDejaVue({ onglet: valeurOngletSynthese("A"), journee: valeurJourSynthese("A", jour), compteId: "B", jour })).toBe(false);
  });
  it("le lendemain, la synthèse revient ; l'ancien format de repère (sans compte) ne vaut plus", () => {
    expect(syntheseDejaVue({ onglet: null, journee: valeurJourSynthese("A", "2026-10-27"), compteId: "A", jour })).toBe(false);
    expect(syntheseDejaVue({ onglet: null, journee: jour, compteId: "A", jour })).toBe(false);
  });
  it("le drapeau « 1 » des specs e2e (e2e/aides.ts) neutralise toujours la fenêtre", () => {
    expect(syntheseDejaVue({ onglet: "1", journee: null, compteId: "A", jour })).toBe(true);
  });
});
