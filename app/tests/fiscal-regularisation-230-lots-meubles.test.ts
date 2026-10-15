/**
 * Décision X10 du 14/10/2026 (fiche FIN-04), recommandation suivie : la régularisation 230 n'est exigée, et
 * n'est comptée si elle est saisie, que pour les lots qui ont au moins une période en location NUE sur l'année.
 *
 * Avant : un lot confirmé « meublé » toute l'année restait dans la boucle 230. Sans montant saisi, l'alerte « La
 * régularisation 230… est à compléter » ne disparaissait jamais ; avec un montant saisi, il venait en déduction
 * des charges 2044 d'un lot qui ne figure pas dans la 2044 (ses pièces sont comptées en BIC).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  recapitulatifFiscal,
  type ComposantesFiscales,
  type EcritureFiscale,
  type ExerciceFiscalLot,
  type PeriodeFiscale,
} from "../src/lib/fiscal";

const ALERTE_230 = "La régularisation 230 de l’année précédente est à compléter ou à confirmer à zéro.";

const loyer = (lot: string, mois: number): EcritureFiscale => ({
  id: `${lot}-loyer-${mois}`, categorie: "Loyer", sens: "recette", montant: 780,
  date_piece: `2026-${String(mois).padStart(2, "0")}-05`, lot_id: lot, bail_id: `bail-${lot}`, encaissement_id: `enc-${lot}-${mois}`,
});
const loyersDe = (lot: string) => Array.from({ length: 12 }, (_, i) => loyer(lot, i + 1));
const capturesDe = (ecritures: EcritureFiscale[]) =>
  new Map<string, ComposantesFiscales>(ecritures.map((e) => [e.id!, { ecriture_id: e.id!, loyer_hc: 780, charges: 0, non_ventile: 0 }]));
const p = (debut: string, fin: string, regime: PeriodeFiscale["regime"]): PeriodeFiscale => ({ debut, fin, quote_part: 100, regime });
const toutes = (regime: PeriodeFiscale["regime"]) => [p("2026-01-01", "2026-12-31", regime)];
const exercice = (lot: string, periodes: PeriodeFiscale[], extra: Partial<ExerciceFiscalLot> = {}): ExerciceFiscalLot => ({
  lot_id: lot, annee: 2026, periodes, justification: "Acte et bail vérifiés",
  regularisation230: 0, quote_part230: 100, justification230: "Décompte N−1 : zéro confirmé", ...extra,
});
const recap = (ecritures: EcritureFiscale[], exercices: ExerciceFiscalLot[]) =>
  recapitulatifFiscal(ecritures, 2026, {
    exigerPerimetre: true, composantes: capturesDe(ecritures),
    exercices: new Map(exercices.map((x) => [x.lot_id, x])),
  });
const ligne230 = (r: ReturnType<typeof recapitulatifFiscal>) => r.rubriques.find((x) => x.code === "230")!;

describe("X10 (FIN-04) : la 230 ne concerne que les lots qui ont une période en location nue", () => {
  it("un lot meublé toute l'année, 230 non saisie : rien à compléter, le récapitulatif n'est pas bloqué", () => {
    const ecritures = loyersDe("meuble");
    const r = recap(ecritures, [exercice("meuble", toutes("meuble"), { regularisation230: null, justification230: null })]);
    expect(ligne230(r).aCompleter).toBe(false);
    expect(r.alertes).not.toContain(ALERTE_230);
    expect(r.incomplet).toBe(false);
    expect(r.meuble.nbEcritures).toBe(12);
  });

  it("un lot meublé toute l'année, 230 saisie par erreur : le montant n'est pas compté dans les charges 2044", () => {
    const ecritures = loyersDe("meuble");
    const r = recap(ecritures, [exercice("meuble", toutes("meuble"), { regularisation230: 450 })]);
    expect(ligne230(r)).toMatchObject({ montant: 0, montantQuotePart: 0, aCompleter: false });
    expect(r.totalCharges).toBe(0);
    expect(r.revenuNet).toBe(0);
  });

  it("un lot hors de vos droits toute l'année n'est pas une location nue : pas de 230 non plus", () => {
    const ecritures = loyersDe("tiers");
    const r = recap(ecritures, [exercice("tiers", toutes("hors_perimetre"), { regularisation230: null, justification230: null })]);
    expect(ligne230(r).aCompleter).toBe(false);
    expect(r.alertes).not.toContain(ALERTE_230);
  });

  it("un lot nu puis meublé garde sa 230 : il a une période nue sur l'année", () => {
    const ecritures = loyersDe("mixte");
    const periodes = [p("2026-01-01", "2026-06-30", "nu"), p("2026-07-01", "2026-12-31", "meuble")];
    const manquante = recap(ecritures, [exercice("mixte", periodes, { regularisation230: null, justification230: null })]);
    expect(ligne230(manquante).aCompleter).toBe(true);
    expect(manquante.alertes).toContain(ALERTE_230);
    const saisie = recap(ecritures, [exercice("mixte", periodes, { regularisation230: 450 })]);
    expect(ligne230(saisie)).toMatchObject({ montant: 450, aCompleter: false });
    expect(saisie.totalCharges).toBe(-450);
  });

  it("un lot meublé puis nu garde aussi sa 230 (l'ordre des périodes ne compte pas)", () => {
    const periodes = [p("2026-01-01", "2026-03-31", "meuble"), p("2026-04-01", "2026-12-31", "nu")];
    const r = recap(loyersDe("mixte"), [exercice("mixte", periodes, { regularisation230: null, justification230: null })]);
    expect(ligne230(r).aCompleter).toBe(true);
  });

  it("deux lots : le lot nu confirmé à zéro suffit, le lot meublé n'ajoute aucune alerte", () => {
    const ecritures = [...loyersDe("nu"), ...loyersDe("meuble")];
    const r = recap(ecritures, [
      exercice("nu", toutes("nu")),
      exercice("meuble", toutes("meuble"), { regularisation230: null, justification230: null }),
    ]);
    expect(ligne230(r).aCompleter).toBe(false);
    expect(r.incomplet).toBe(false);
  });

  it("deux lots : la 230 saisie sur le lot nu est comptée, celle du lot meublé ne l'est pas", () => {
    const ecritures = [...loyersDe("nu"), ...loyersDe("meuble")];
    const r = recap(ecritures, [
      exercice("nu", toutes("nu"), { regularisation230: 200 }),
      exercice("meuble", toutes("meuble"), { regularisation230: 999 }),
    ]);
    expect(ligne230(r).montant).toBe(200);
    expect(r.totalCharges).toBe(-200);
  });

  it("deux lots : le lot nu dont la 230 manque reste signalé même si l'autre est meublé", () => {
    const ecritures = [...loyersDe("nu"), ...loyersDe("meuble")];
    const r = recap(ecritures, [
      exercice("nu", toutes("nu"), { regularisation230: null, justification230: null }),
      exercice("meuble", toutes("meuble")),
    ]);
    expect(ligne230(r).aCompleter).toBe(true);
    expect(r.alertes).toContain(ALERTE_230);
  });

  it("un lot dont l'exercice n'est pas confirmé reste à compléter : on ne sait pas encore s'il est nu", () => {
    const ecritures = loyersDe("inconnu");
    const r = recap(ecritures, []);
    expect(ligne230(r).aCompleter).toBe(true);
    expect(r.alertes).toContain(ALERTE_230);
  });

  it("un exercice d'une autre année ne dispense de rien", () => {
    const ecritures = loyersDe("ancien");
    const r = recap(ecritures, [exercice("ancien", toutes("meuble"), { annee: 2025 })]);
    expect(ligne230(r).aCompleter).toBe(true);
  });

  it("une quote-part de 230 qui n'est pas 100 % ne change rien pour un lot nu", () => {
    const r = recap(loyersDe("nu"), [exercice("nu", toutes("nu"), { regularisation230: 300, quote_part230: 50 })]);
    expect(ligne230(r)).toMatchObject({ montant: 300, montantQuotePart: 150 });
    expect(r.ventile).toBe(true);
  });

  it("le formulaire du lot le dit en clair : la ligne 230 ne concerne que les périodes en location nue", () => {
    const formulaire = readFileSync("src/components/formulaires-fiscaux.tsx", "utf8");
    expect(formulaire).toContain("Cette ligne ne concerne que les périodes en location nue : pour un lot meublé ou hors de vos droits toute l’année, elle n’est ni demandée ni comptée.");
  });
});
