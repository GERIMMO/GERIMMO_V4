/**
 * Outil gratuit « Quittance de loyer » (29/09) : un terme payé en entier donne
 * une quittance ; payé en partie, un reçu de paiement partiel avec le reste
 * dû, qui ne vaut pas quittance. Les mentions sont celles du modèle de
 * l'application.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MENTIONS_QUITTANCE,
  MENTIONS_RECU_PARTIEL,
  bornesPeriode,
  calculerQuittance,
  libellePeriode,
  lireQuittanceMemorisee,
  moisSuivant,
} from "../src/lib/outils/quittance";
import { formaterEuros } from "../src/lib/outils/nombres";

describe("quittance ou reçu partiel", () => {
  it("850 + 120 = 970 ; reçu 500 → reçu de paiement partiel, reste dû 470,00 €", () => {
    const r = calculerQuittance({ loyerHc: 850, charges: 120, montantRecu: 500 });
    expect(r.total).toBe(970);
    expect(r.estQuittance).toBe(false);
    expect(r.titre).toBe("Reçu de paiement partiel");
    expect(formaterEuros(r.resteDu)).toBe("470,00 €");
  });

  it("payé en entier → quittance, rien de dû, imprimable", () => {
    const r = calculerQuittance({ loyerHc: 850, charges: 120, montantRecu: 970 });
    expect(r.estQuittance).toBe(true);
    expect(r.titre).toBe("Quittance de loyer");
    expect(r.resteDu).toBe(0);
    expect(r.tropPercu).toBe(0);
    expect(r.imprimable).toBe(true);
  });

  // Audit final (PUB-12) : un loyer de −850 € donnait une « Quittance de loyer » de −730,00 € prête à imprimer.
  it("un montant négatif n'établit aucun document", () => {
    const r = calculerQuittance({ loyerHc: -850, charges: 120, montantRecu: -730 });
    expect(r.montantNegatif).toBe(true);
    expect(r.imprimable).toBe(false);
    expect(calculerQuittance({ loyerHc: 850, charges: 120, montantRecu: -1 }).imprimable).toBe(false);
  });

  // Audit final (PUB-12) : 2 000 € reçus pour un terme de 970 € attestaient « avoir reçu 2 000,00 € » sans alerte.
  it("un montant reçu au-delà du terme est un trop-perçu : la quittance attend une saisie corrigée", () => {
    const r = calculerQuittance({ loyerHc: 850, charges: 120, montantRecu: 2000 });
    expect(r.estQuittance).toBe(true);
    expect(r.tropPercu).toBe(1030);
    expect(r.imprimable).toBe(false);
    expect(formaterEuros(r.tropPercu)).toMatch(/^1\s030,00\s€$/);
  });
});

describe("mentions", () => {
  it("reprennent le modèle de quittance de l'application", () => {
    const modele = readFileSync(path.resolve(__dirname, "../src/lib/documents/modeles/quittance.ts"), "utf8").replace(
      /\s+/g,
      " "
    );
    for (const m of [...MENTIONS_QUITTANCE, ...MENTIONS_RECU_PARTIEL]) expect(modele).toContain(m);
    expect(MENTIONS_RECU_PARTIEL.join(" ")).toContain("il ne vaut pas quittance");
    expect(MENTIONS_QUITTANCE.join(" ")).toContain("article 21 de la loi du 6 juillet 1989");
    expect(MENTIONS_QUITTANCE.join(" ")).toContain("termes antérieurs");
  });
});

describe("périodes", () => {
  it("mois suivant, passage d'année compris", () => {
    expect(moisSuivant("2026-09")).toBe("2026-10");
    expect(moisSuivant("2026-12")).toBe("2027-01");
  });

  it("libellé et bornes du mois", () => {
    expect(libellePeriode("2026-02")).toBe("février 2026");
    expect(bornesPeriode("2026-02")).toEqual({ du: "01/02/2026", au: "28/02/2026" });
    expect(bornesPeriode("2028-02")?.au).toBe("29/02/2028");
  });
});

describe("mémorisation locale", () => {
  it("relit un enregistrement valide et ignore le reste", () => {
    const v = lireQuittanceMemorisee(JSON.stringify({ bailleurNom: "M. Martin", loyerHc: "850", intrus: 1 }));
    expect(v?.bailleurNom).toBe("M. Martin");
    expect(v?.loyerHc).toBe("850");
    expect(v?.charges).toBe("");
    expect(lireQuittanceMemorisee("{pas du json")).toBeNull();
    expect(lireQuittanceMemorisee(null)).toBeNull();
  });
});
