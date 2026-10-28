/**
 * Relectures du chantier « loyers — écrans et textes » (audit final du 27/10).
 *  · LOY-07, page Loyers de l'agence : la tuile et la carte « Impayés à relancer » comptent la même liste ; un terme à échoir
 *    ne se relance pas pour lui-même, seulement pour la dette antérieure échue qu'il porte.
 *  · LOY-21 : la synthèse d'alertes fermée l'est pour un compte, dans l'onglet comme pour la journée.
 */
import { describe, expect, it } from "vitest";
import { accordMontant, echeancesNonVerifiees, libelleEncaisser, relancesDuMois, repartitionEncaissement, totauxEcheances } from "@/lib/finances";
import { lireQuittancementMois } from "@/lib/quittancement-du-mois";
import { eur, moisEnFrancais } from "@/lib/ged";
import { syntheseDejaVue, valeurJourSynthese, valeurOngletSynthese } from "@/lib/synthese-alertes-vue";

const JOUR = "2026-10-28";
describe("LOY-07 : relances exigibles de la page Loyers de l'agence", () => {
  it("acompte sur un terme à échoir (statut « partiel », échéance future), sans dette antérieure : rien à relancer, 500 € à échoir", () => {
    const r = relancesDuMois([{ montant_du: 700, montant_couvert: 200, statut: "partiel", date_echeance: "2026-11-05", dette_anterieure_reste: null }], JOUR);
    expect(r.aRelancer).toEqual([]);
    expect(r.exigible).toBe(0);
    expect(totauxEcheances([{ montant_du: 700, montant_couvert: 200, statut: "partiel", date_echeance: "2026-11-05" }], JOUR)).toMatchObject({ resteDu: 0, aEchoir: 500 });
  });
  it("cas réel : terme à échoir sans règlement, dette antérieure échue de 400 € (septembre partiel) — 1 à relancer, 400 € exigibles, 700 € à échoir", () => {
    // C'est l'état que la base produit : l'imputation au plus ancien solde la dette avant de couvrir le terme suivant.
    const r = relancesDuMois([{ montant_du: 700, montant_couvert: 0, statut: "attendu", date_echeance: "2026-11-05", dette_anterieure_reste: 400 }], JOUR);
    expect(r.aRelancer).toHaveLength(1);
    expect(r.aRelancer[0]).toMatchObject({ resteExigible: 0, aEchoir: 700, detteAnterieure: 400 });
    expect(r.exigible).toBe(400);
  });
  it("garde de la fonction pure (état que l'imputation de la base ne produit pas : acompte ET dette antérieure) : seule la dette est relancée", () => {
    const r = relancesDuMois([{ montant_du: 700, montant_couvert: 200, statut: "partiel", date_echeance: "2026-11-05", dette_anterieure_reste: 400 }], JOUR);
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

describe("Bouton « Encaisser » : la répartition réelle de l'imputation au plus ancien (quatrième relecture)", () => {
  const plat = (t: string) => t.replace(/[\u202f\u00a0]/g, " ");
  const libelle = (reste: number, detail: { periode: string; reste: number | string }[]) =>
    plat(libelleEncaisser(reste, detail, detail[0]?.periode ?? null, eur, moisEnFrancais));
  it("un mois de dette : « dont 400,00 € pour septembre 2026 »", () => {
    expect(libelle(700, [{ periode: "2026-09-01", reste: 400 }])).toBe("Encaisser 700,00 € (dont 400,00 € pour septembre 2026)");
  });
  it("deux mois (août 400 € restants, septembre 700 €), 700 € encaissés : 400 € pour août et 300 € pour septembre", () => {
    const detail = [{ periode: "2026-08-01", reste: "400.00" }, { periode: "2026-09-01", reste: "700.00" }];
    expect(repartitionEncaissement(700, detail)).toEqual({ anterieur: [{ periode: "2026-08-01", montant: 400 }, { periode: "2026-09-01", montant: 300 }], terme: 0 });
    expect(libelle(700, detail)).toBe("Encaisser 700,00 € (dont 400,00 € pour août et 300,00 € pour septembre 2026)");
  });
  it("deux mois sur deux années : chaque mois avec son année", () => {
    expect(libelle(700, [{ periode: "2025-12-01", reste: 100 }, { periode: "2026-01-01", reste: 700 }]))
      .toBe("Encaisser 700,00 € (dont 100,00 € pour décembre 2025 et 600,00 € pour janvier 2026)");
  });
  it("trois mois servis : le total de dette antérieure et le premier mois", () => {
    expect(libelle(700, [{ periode: "2026-07-01", reste: 100 }, { periode: "2026-08-01", reste: 200 }, { periode: "2026-09-01", reste: 700 }]))
      .toBe("Encaisser 700,00 € (dont 700,00 € de dette antérieure, juillet 2026 d’abord)");
  });
  it("reste exactement égal à la dette : tout va à la dette, rien au terme ; et ce qui dépasse revient au terme", () => {
    expect(repartitionEncaissement(400, [{ periode: "2026-09-01", reste: 400 }])).toEqual({ anterieur: [{ periode: "2026-09-01", montant: 400 }], terme: 0 });
    expect(repartitionEncaissement(700, [{ periode: "2026-09-01", reste: 400 }]).terme).toBe(300);
  });
  it("au centime", () => {
    expect(repartitionEncaissement(700.01, [{ periode: "2026-08-01", reste: "0.07" }, { periode: "2026-09-01", reste: "699.95" }]))
      .toEqual({ anterieur: [{ periode: "2026-08-01", montant: 0.07 }, { periode: "2026-09-01", montant: 699.94 }], terme: 0 });
  });
  it("sans détail (fonction de base antérieure) : le mois le plus ancien, apostrophe typographique, sans montant inventé", () => {
    expect(plat(libelleEncaisser(700, null, "2026-08-01", eur, moisEnFrancais))).toBe("Encaisser 700,00 € (août 2026 d’abord)");
  });
});

describe("Lecture du quittancement : paginée, jamais tronquée en silence (quatrième relecture)", () => {
  const client = (total: number, erreurPage?: number) => {
    const appels: [number, number][] = [];
    return { appels, rpc: () => ({ range: async (de: number, a: number) => {
      appels.push([de, a]);
      if (erreurPage !== undefined && de / 1000 === erreurPage) return { data: null, error: { message: "coupure" } };
      return { data: Array.from({ length: Math.max(0, Math.min(total, a + 1) - de) }, (_, i) => ({ appel_id: String(de + i), date_echeance: "2026-10-01" })), error: null };
    } }) };
  };
  it("1 100 baux : deux pages, 1 100 lignes", async () => {
    const c = client(1100);
    const r = await lireQuittancementMois(c as never, "org", "2026-10-01");
    expect(r.data).toHaveLength(1100);
    expect(c.appels).toEqual([[0, 999], [1000, 1999]]);
  });
  it("une page en échec rend l'erreur, pas une liste partielle", async () => {
    const r = await lireQuittancementMois(client(1100, 1) as never, "org", "2026-10-01");
    expect(r.data).toBeNull();
    expect(r.error).toBeTruthy();
  });
  it("une date d'échéance manquante est signalée (pas de repli silencieux sur le statut)", () => {
    expect(echeancesNonVerifiees([{ montant_du: 700, montant_couvert: 0, statut: "partiel", date_echeance: "2026-11-05" }])).toBe(false);
    expect(echeancesNonVerifiees([{ montant_du: 700, montant_couvert: 0, statut: "partiel" }])).toBe(true);
  });
});
