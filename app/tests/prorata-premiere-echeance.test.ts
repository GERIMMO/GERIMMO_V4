/**
 * Audit final du 27/10 (COD-01) — le prorata de la première échéance imprimé au contrat suit la règle de la base.
 *
 * `generer_appels_loyer_interne` (20260803_prorata_au_centime, 20261014120000) proratise loyer et charges SÉPARÉMENT, un seul
 * arrondi au centime à la fin sur chaque composante, total = somme : round(650,01 × 15/30, 2) + round(100,01 × 15/30, 2) =
 * 375,02 €. Le bail nu et le bail meublé calculaient chacun sur le total, en flottants, dans deux ordres différents : 375,01 €
 * tous les deux ici, et 148 833 couples (montant, mois, jour d'entrée) où nu ≠ meublé sur un balayage de 300 à 3 000 € au
 * centime. Les deux contrats passent par `prorataPremiereEcheance`, en centimes entiers. Sans base.
 */
import { describe, expect, it } from "vitest";
import { prorataPremiereEcheance } from "@/lib/prorata-premiere-echeance";
import { Fusion } from "@/lib/documents/gabarit";
import { construireBailNu } from "@/lib/documents/modeles/bail-nu";
import { construireBailMeuble } from "@/lib/documents/modeles/bail-meuble";
import { contexte } from "./fixtures/contexte-document";

/** La règle de la base, rejouée sur des entiers : round(x, 2) de PostgreSQL pour un montant positif. */
function regleBase(loyer: number, charges: number, jours: number, joursMois: number): number {
  const lc = Math.round(loyer * 100);
  const cc = Math.round(charges * 100);
  return Math.round((lc * jours) / joursMois) + Math.round((cc * jours) / joursMois);
}

/** Les deux anciens calculs, gardés ici comme témoins de l'écart. */
const ancienNu = (total: number, jm: number, jour: number) => Math.round(((jm - jour + 1) / jm) * total * 100) / 100;
const ancienMeuble = (total: number, jm: number, jour: number) => Math.round((total * (jm - jour + 1) * 100) / jm) / 100;

describe("prorataPremiereEcheance", () => {
  it("arrondit chaque composante, puis somme : 650,01 + 100,01 € pour 15 jours sur 30 → 375,02 € (l'ancien calcul disait 375,01)", () => {
    const p = prorataPremiereEcheance(650.01, 100.01, "2026-06-16");
    expect(p).toEqual({ joursDus: 15, joursDuMois: 30, loyerHc: 325.01, charges: 50.01, total: 375.02, prorata: true });
    expect(ancienNu(750.02, 30, 16)).toBe(375.01);
    expect(ancienMeuble(750.02, 30, 16)).toBe(375.01);
  });

  it("un bail qui entre le 1er est un terme plein ; les montants lus en base arrivent en chaînes", () => {
    expect(prorataPremiereEcheance("650.00", "90.00", "2026-09-01")).toEqual({
      joursDus: 30, joursDuMois: 30, loyerHc: 650, charges: 90, total: 740, prorata: false,
    });
    expect(prorataPremiereEcheance(650, 90, "2026-09-15T00:00:00+00:00").total).toBe(394.67);
  });

  it("connaît les mois : 29 février, mois de 31 jours, entrée le dernier jour", () => {
    expect(prorataPremiereEcheance(1000, 0, "2024-02-29")).toMatchObject({ joursDus: 1, joursDuMois: 29, total: 34.48 });
    expect(prorataPremiereEcheance(1000, 0, "2026-01-31")).toMatchObject({ joursDus: 1, joursDuMois: 31, total: 32.26 });
    expect(prorataPremiereEcheance(1000, 0, "2026-04-02")).toMatchObject({ joursDus: 29, joursDuMois: 30, total: 966.67 });
  });

  it("propriété : sur 10 000 triplets, les centimes valent round(L×j/n,2) + round(C×j/n,2) et le total est la somme des composantes", () => {
    let graine = 20261027;
    const alea = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
    const mois = ["2026-01", "2024-02", "2026-02", "2026-04", "2026-06", "2026-09", "2026-12"];
    for (let i = 0; i < 10_000; i++) {
      const loyer = Math.round((300 + alea() * 2700) * 100) / 100;
      const charges = Math.round(alea() * 300 * 100) / 100;
      const m = mois[Math.floor(alea() * mois.length)];
      const [a, mm] = m.split("-").map(Number);
      const jm = new Date(Date.UTC(a, mm, 0)).getUTCDate();
      const jour = 2 + Math.floor(alea() * (jm - 1));
      const p = prorataPremiereEcheance(loyer, charges, `${m}-${String(jour).padStart(2, "0")}`);
      expect(Math.round(p.total * 100), `${loyer} + ${charges} le ${jour}/${mm}`).toBe(regleBase(loyer, charges, jm - jour + 1, jm));
      expect(Math.round(p.loyerHc * 100) + Math.round(p.charges * 100)).toBe(Math.round(p.total * 100));
      expect(p.prorata).toBe(true);
    }
  });
});

describe("les deux contrats impriment le même centime que l'appel de loyer", () => {
  const cas = (loyer: number, charges: number, debut: string) => {
    const base = contexte();
    const ctx = contexte({ bail: { ...base.bail, loyer_hc: loyer, charges, date_debut: debut } });
    return {
      nu: construireBailNu(ctx, { dpeClasse: "D", f: new Fusion() }).html,
      meuble: construireBailMeuble({ ...ctx, bail: { ...ctx.bail, type: "meuble" } }, { dpeClasse: "D", inventaire: [], f: new Fusion() }).html,
    };
  };
  const montantPremiereEcheance = (html: string) => html.match(/première échéance : [\s\S]*?([\d\s ]+,\d{2})\s€/)?.[1].replace(/[\s ]/g, "");

  it("650,01 + 100,01 € le 16 juin : 375,02 € dans le bail nu ET le bail meublé", () => {
    const { nu, meuble } = cas(650.01, 100.01, "2026-06-16");
    expect(montantPremiereEcheance(nu)).toBe("375,02");
    expect(montantPremiereEcheance(meuble)).toBe("375,02");
    expect(nu).toContain("(premier mois au prorata)");
    expect(meuble).toContain("(premier mois au prorata)");
  });

  it("300,01 € sur 28 jours, entrée le 15 (nu 150,01 contre meublé 150,00 avant) : un seul centime, celui de la base", () => {
    const { nu, meuble } = cas(300.01, 0, "2026-02-15");
    const attendu = (regleBase(300.01, 0, 14, 28) / 100).toFixed(2).replace(".", ",");
    expect(montantPremiereEcheance(nu)).toBe(attendu);
    expect(montantPremiereEcheance(meuble)).toBe(attendu);
    expect(ancienNu(300.01, 28, 15)).not.toBe(ancienMeuble(300.01, 28, 15));
  });
});
