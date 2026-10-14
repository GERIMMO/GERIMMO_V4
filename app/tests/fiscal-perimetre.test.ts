/**
 * Vérification adverse du 14/10/2026 (VER-TS-04) : un lot nu de janvier à juin puis meublé de juillet à
 * décembre, 12 loyers de 780 € encaissés. Le tableau du récapitulatif « location nue » dit 4 680 € (six
 * loyers) mais le texte annonçait « Périmètre : 12 écritures enregistrées » sans dire que la moitié des
 * loyers était écartée.
 */
import { describe, expect, it } from "vitest";
import {
  phrasePerimetreFiscal,
  recapitulatifFiscal,
  type ComposantesFiscales,
  type EcritureFiscale,
  type ExerciceFiscalLot,
  type PeriodeFiscale,
  type QualificationFiscale,
} from "../src/lib/fiscal";

const loyer = (mois: number): EcritureFiscale => ({
  id: `loyer-${mois}`, categorie: "Loyer", sens: "recette", montant: 780,
  date_piece: `2026-${String(mois).padStart(2, "0")}-05`, lot_id: "lot", bail_id: "bail", encaissement_id: `enc-${mois}`,
});
const douzeLoyers = Array.from({ length: 12 }, (_, i) => loyer(i + 1));
const composantes = new Map<string, ComposantesFiscales>(
  douzeLoyers.map((e) => [e.id!, { ecriture_id: e.id!, loyer_hc: 780, charges: 0, non_ventile: 0 }]),
);
const exercice = (periodes: PeriodeFiscale[]): ExerciceFiscalLot => ({
  lot_id: "lot", annee: 2026, periodes, justification: "Acte vérifié", regularisation230: 0, quote_part230: 100, justification230: "Zéro confirmé",
});
const recap = (periodes: PeriodeFiscale[], ecritures = douzeLoyers, qualifications = new Map<string, QualificationFiscale>()) =>
  recapitulatifFiscal(ecritures, 2026, { exigerPerimetre: true, composantes, qualifications, exercices: new Map([["lot", exercice(periodes)]]) });
const p = (debut: string, fin: string, regime: PeriodeFiscale["regime"]): PeriodeFiscale => ({ debut, fin, quote_part: 100, regime });

describe("phrasePerimetreFiscal : ce qui est dans le tableau, et ce qui en est écarté", () => {
  it("nu puis meublé : 12 examinées, 6 comptées, 6 écartées pour période meublée", () => {
    const r = recap([p("2026-01-01", "2026-06-30", "nu"), p("2026-07-01", "2026-12-31", "meuble")]);
    expect(r.rubriques.find((x) => x.code === "211")!.montant).toBe(4680);
    expect(phrasePerimetreFiscal(r)).toBe(
      "Périmètre : 12 écritures de 2026 examinées, dont 6 comptées dans le tableau. Écartées du tableau : 6 en période meublée (hors revenus fonciers).",
    );
  });

  it("nu puis hors de mes droits : la période écartée est nommée comme telle", () => {
    const r = recap([p("2026-01-01", "2026-08-31", "nu"), p("2026-09-01", "2026-12-31", "hors_perimetre")]);
    expect(phrasePerimetreFiscal(r)).toBe(
      "Périmètre : 12 écritures de 2026 examinées, dont 8 comptées dans le tableau. Écartées du tableau : 4 sur une période hors de vos droits.",
    );
  });

  it("trois périodes : meublé et hors de mes droits cités ensemble", () => {
    const r = recap([p("2026-01-01", "2026-03-31", "nu"), p("2026-04-01", "2026-09-30", "meuble"), p("2026-10-01", "2026-12-31", "hors_perimetre")]);
    expect(phrasePerimetreFiscal(r)).toBe(
      "Périmètre : 12 écritures de 2026 examinées, dont 3 comptées dans le tableau. Écartées du tableau : 6 en période meublée (hors revenus fonciers) ; 3 sur une période hors de vos droits.",
    );
  });

  it("tout dans le tableau : la phrase le dit, sans écart inventé", () => {
    const r = recap([p("2026-01-01", "2026-12-31", "nu")]);
    expect(phrasePerimetreFiscal(r)).toBe("Périmètre : 12 écritures de 2026 examinées, toutes comptées dans le tableau.");
  });

  it("une pièce classée à part (fonds de travaux ALUR) n'est ni comptée ni passée sous silence", () => {
    const alur: EcritureFiscale = { id: "alur", categorie: "Fonds travaux ALUR", sens: "depense", montant: 120, date_piece: "2026-03-10", lot_id: "lot" };
    const r = recap([p("2026-01-01", "2026-12-31", "nu")], [loyer(1), alur]);
    expect(r.fondsTravauxAlur).toBe(120);
    expect(phrasePerimetreFiscal(r)).toBe(
      "Périmètre : 2 écritures de 2026 examinées, dont 1 comptée dans le tableau. Écartées du tableau : 1 classée à part (fonds de travaux ALUR, charges récupérables ou dépenses non déductibles).",
    );
  });

  it("une seule écriture : accords au singulier", () => {
    const r = recap([p("2026-01-01", "2026-12-31", "nu")], [loyer(1)]);
    expect(phrasePerimetreFiscal(r)).toBe("Périmètre : 1 écriture de 2026 examinée, toute comptée dans le tableau.");
  });

  it("sans tableau (récapitulatif meublé) : seulement le nombre d'écritures examinées", () => {
    const r = recapitulatifFiscal(douzeLoyers, 2026, { lotsMeubles: new Set(["lot"]) });
    expect(phrasePerimetreFiscal(r, { tableau: false })).toBe("Périmètre : 12 écritures de 2026 examinées.");
  });
});
