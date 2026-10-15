/**
 * Décision X21 du 14/10/2026 (fiche VER-TS-05), recommandation suivie : le récapitulatif annuel « location nue » d'un lot ne lit
 * plus TOUTES les qualifications et TOUTES les captures de l'organisation. Les deux lectures sont bornées aux pièces du lot et de
 * l'année (filtre `in` sur les identifiants d'écritures déjà lus), et une lecture qui atteint le plafond de lignes de l'API
 * (1 000) fait refuser le document avec un message qui dit ce qui s'est passé.
 *
 * Avant : à partir de 1 000 lignes fiscales dans l'organisation (tous lots, toutes années), le document d'un lot de trois loyers
 * était refusé par « Ce dossier contient trop de lignes pour un export intégral. Réduisez la période avant de générer le
 * document » : aucune période ne se règle pour ce document.
 *
 * La base est simulée AVEC un plafond de 1 000 lignes (fixtures/base-simulee, `plafondLignes`), comme PostgREST : sans lui une
 * lecture non bornée passerait pour correcte.
 */
import { describe, expect, it, vi } from "vitest";
import { baseSimulee, filtresDe, lecturesSansFiltreOrganisation, type Ligne } from "./fixtures/base-simulee";
import { assemblerComplementGestion, chargerRecapitulatifNu } from "@/lib/documents/modeles/catalogue-gestion";
import { RefusDocument } from "@/lib/documents/modeles/catalogue-bail";

// Le complément de gestion ne lit pas le bail pour ce document : aucune autre dépendance à simuler.
vi.mock("@/lib/documents/modeles/communs", async (importOriginal) => ({ ...(await importOriginal<object>()), chargerContexteBail: vi.fn() }));

const o = { organization_id: "org" };
const AUTRE = { organization_id: "autre-org" };
const piece = (id: string, extra: Ligne = {}): Ligne => ({
  ...o, id, lot_id: "lot", categorie: "Intérêts d'emprunt", sens: "depense", montant: 100, date_piece: "2026-03-10", ...extra,
});
const loyer = (m: number, extra: Ligne = {}): Ligne => piece(`loyer${m}`, {
  bail_id: "bail", encaissement_id: `enc${m}`, categorie: "loyer", sens: "recette", montant: 840, date_piece: `2026-0${m}-05`, ...extra,
});
const periodes = (annee: number, regime = "nu") => [{ debut: `${annee}-01-01`, fin: `${annee}-12-31`, quote_part: 100, regime }];
const exercice = (lot_id: string, annee: number, version: number): Ligne => ({
  ...o, lot_id, annee, version, periodes: periodes(annee), justification: "Lot nu détenu à 100 %",
  regularisation230: 0, quote_part230: 100, justification230: "Aucune provision de l’année précédente",
});
const capture = (ecriture_id: string, extra: Ligne = {}): Ligne => ({ ...o, ecriture_id, loyer_hc: 780, charges: 60, non_ventile: 0, ...extra });
const qualification = (ecriture_id: string, version = 1, extra: Ligne = {}): Ligne => ({
  ...o, ecriture_id, lot_id: "lot", nature: "deductible", rubrique: "250", justification: "Tableau d'amortissement de la banque", version, ...extra,
});

/** Le dossier de référence : trois loyers de 840 € (780 + 60) et 2 345,67 € d'intérêts d'emprunt qualifiés en 250 pour le lot, en 2026. */
function dossier(): Record<string, Ligne[]> {
  return {
    organizations: [{ id: "org", name: "Parc de Claire Moreau", type: "proprietaire_direct" }],
    lots: [{ ...o, id: "lot", nom: "Appartement Jardin", bien_id: "bien", meuble: false }, { ...o, id: "lot-voisin", nom: "Studio", bien_id: "bien", meuble: false }],
    biens: [{ ...o, id: "bien", address_line1: "12 rue du Parc", postal_code: "75012", city: "Paris" }],
    ecritures: [loyer(1), loyer(2), loyer(3), piece("interets", { montant: 2345.67 })],
    fiscal_encaissements_composantes: [1, 2, 3].map((m) => capture(`loyer${m}`)),
    fiscal_qualifications_ecritures: [qualification("interets")],
    fiscal_exercices_lots: [exercice("lot", 2026, 1)],
  };
}
const base = (tables: Record<string, Ligne[]>) => baseSimulee(tables, { plafondLignes: 1000 });
const ligne = (recap: Awaited<ReturnType<typeof chargerRecapitulatifNu>>, code: string) => recap.rubriques.find((r) => r.code === code)!;
const lire = (b: ReturnType<typeof base>, lot = "lot") => chargerRecapitulatifNu(b.client, "org", lot, 2026);

/** Les mêmes lignes fiscales que le dossier de référence, mais d'autres lots et d'autres années : de quoi dépasser 1 000 lignes. */
function bruit(n: number, tables: Record<string, Ligne[]>) {
  for (let i = 0; i < n; i++) {
    tables.ecritures.push(piece(`voisin${i}`, { lot_id: "lot-voisin" }));
    tables.fiscal_qualifications_ecritures.push(qualification(`voisin${i}`, 1, { lot_id: "lot-voisin" }));
    tables.fiscal_encaissements_composantes.push(capture(`voisin${i}`));
    // L'an dernier, sur le lot lui-même : ses captures et qualifications ne sont pas celles de l'exercice 2026.
    tables.fiscal_qualifications_ecritures.push(qualification(`ancien${i}`));
    tables.fiscal_encaissements_composantes.push(capture(`ancien${i}`));
  }
}

describe("X21 (VER-TS-05) : le document d'un lot ne dépend plus du volume fiscal de l'organisation", () => {
  it("1 200 pièces d'un autre lot et d'une autre année : le récapitulatif du lot est le même, sans refus", async () => {
    const tables = dossier();
    bruit(1200, tables);
    const recap = await lire(base(tables));
    expect(ligne(recap, "211").montant).toBe(2340);
    expect(ligne(recap, "250").montant).toBe(2345.67);
    expect(recap.nbEcritures).toBe(4);
    expect(recap.incomplet).toBe(false);
  });

  it("le document se génère jusqu'au PDF : ni refus « trop de lignes », ni période à réduire", async () => {
    const tables = dossier();
    bruit(1200, tables);
    const r = await assemblerComplementGestion("recap_fiscal_nu", base(tables).client, "org", "lot", { annee: "2026", interets_emprunt: "" });
    expect(r).not.toHaveProperty("erreur");
    expect(JSON.stringify(r)).not.toContain("Réduisez la période");
  });

  it("les deux lectures sont bornées par un filtre `in` sur les identifiants des pièces du lot et de l'année", async () => {
    const tables = dossier();
    tables.ecritures.push(
      piece("interets-2025", { date_piece: "2025-03-10" }),
      piece("interets-2027", { date_piece: "2027-03-10" }),
      piece("interets-voisin", { lot_id: "lot-voisin" }),
    );
    const b = base(tables);
    await lire(b);
    for (const table of ["fiscal_qualifications_ecritures", "fiscal_encaissements_composantes"]) {
      const filtre = filtresDe(b, table).find((f) => f.op === "in" && f.col === "ecriture_id");
      expect(filtre, `${table} sans filtre sur les identifiants`).toBeDefined();
      const ids = filtre!.val as string[];
      expect(ids).toEqual(expect.arrayContaining(["loyer1", "loyer2", "loyer3", "interets"]));
      expect(ids).not.toEqual(expect.arrayContaining(["interets-2025"]));
      expect(ids).not.toEqual(expect.arrayContaining(["interets-2027"]));
      expect(ids).not.toEqual(expect.arrayContaining(["interets-voisin"]));
    }
    expect(lecturesSansFiltreOrganisation(b, "org")).toEqual([]);
  });

  it("l'exercice lu est celui du lot et de l'année, pas tous ceux de l'organisation", async () => {
    const b = base(dossier());
    await lire(b);
    expect(filtresDe(b, "fiscal_exercices_lots")).toEqual(expect.arrayContaining([
      { op: "eq", col: "annee", val: 2026 }, { op: "eq", col: "lot_id", val: "lot" },
    ]));
  });

  it("une pièce sans lot, qualifiée pour ce lot, est toujours comptée ; celle qualifiée pour un autre lot ne l'est pas", async () => {
    const tables = dossier();
    tables.ecritures.push(piece("sans-lot", { lot_id: null, montant: 50 }), piece("sans-lot-voisin", { lot_id: null, montant: 70 }));
    tables.fiscal_qualifications_ecritures.push(qualification("sans-lot"), qualification("sans-lot-voisin", 1, { lot_id: "lot-voisin" }));
    const recap = await lire(base(tables));
    expect(ligne(recap, "250").montant).toBe(2395.67);
    expect(recap.nbEcritures).toBe(5);
  });

  it("une contre-écriture d'un loyer de l'an dernier retrouve la capture de sa pièce d'origine, hors de l'année", async () => {
    const tables = dossier();
    tables.ecritures.push(
      loyer(12, { id: "loyer-origine", date_piece: "2025-12-05", encaissement_id: "enc-origine" }),
      piece("loyer-inverse", { sens: "depense", categorie: "loyer", montant: 840, contre_ecriture_de: "loyer-origine", encaissement_id: "enc-origine", date_piece: "2026-02-10" }),
    );
    tables.fiscal_encaissements_composantes.push(capture("loyer-origine"));
    const recap = await lire(base(tables));
    // 3 loyers de 780 € de loyer hors charges, moins la contre-écriture de l'un d'eux : 1 560 €.
    expect(ligne(recap, "211").montant).toBe(1560);
    expect(recap.incomplet).toBe(false);
  });

  it("la lecture d'un autre lot ne mélange pas les pièces : le lot voisin a son propre récapitulatif", async () => {
    const tables = dossier();
    tables.fiscal_exercices_lots.push(exercice("lot-voisin", 2026, 1));
    tables.ecritures.push(piece("interets-voisin", { lot_id: "lot-voisin", montant: 900 }));
    tables.fiscal_qualifications_ecritures.push(qualification("interets-voisin", 1, { lot_id: "lot-voisin" }));
    const recap = await lire(base(tables), "lot-voisin");
    expect(ligne(recap, "250").montant).toBe(900);
    expect(ligne(recap, "211").montant).toBe(0);
  });

  it("une autre organisation qui porte les mêmes identifiants ne change rien", async () => {
    const tables = dossier();
    tables.fiscal_qualifications_ecritures.unshift({ ...qualification("interets"), ...AUTRE, nature: "non_deductible", rubrique: null, version: 9 });
    tables.fiscal_encaissements_composantes.unshift({ ...capture("loyer1"), ...AUTRE, loyer_hc: 1, charges: 1 });
    const recap = await lire(base(tables));
    expect(ligne(recap, "250").montant).toBe(2345.67);
    expect(ligne(recap, "211").montant).toBe(2340);
  });
});

describe("X21 : une lecture qui atteint le plafond fait refuser le document, avec un message exact", () => {
  const TRONQUEES = (quoi: string) =>
    `Le récapitulatif 2026 de ce lot ne peut pas être produit : la lecture ${quoi} a atteint la limite de 1 000 lignes et peut être incomplète. ` +
    "Aucun montant n’est imprimé, pour ne pas faire recopier un chiffre faux sur une déclaration. " +
    "Cette limite ne se règle pas dans ce document : signalez-le depuis Aide et retours.";

  it("1 000 écritures du lot dans l'année : refus qui nomme les écritures, sans renvoyer à une période", async () => {
    const tables = dossier();
    for (let i = 0; i < 1000; i++) tables.ecritures.push(piece(`depense${i}`, { categorie: "Divers", montant: 10 }));
    const b = base(tables);
    await expect(lire(b)).rejects.toThrow(RefusDocument);
    await expect(lire(b)).rejects.toThrow(TRONQUEES("des écritures de 2026"));
    const r = await assemblerComplementGestion("recap_fiscal_nu", b.client, "org", "lot", { annee: "2026", interets_emprunt: "" });
    expect(r).toEqual({ erreur: TRONQUEES("des écritures de 2026") });
  });

  it("1 000 écritures sans lot dans l'année : refus aussi (elles peuvent être qualifiées pour ce lot)", async () => {
    const tables = dossier();
    for (let i = 0; i < 1000; i++) tables.ecritures.push(piece(`sans-lot${i}`, { lot_id: null, categorie: "Divers", montant: 10 }));
    await expect(lire(base(tables))).rejects.toThrow(TRONQUEES("des écritures de 2026"));
  });

  it("plus de 1 000 versions de qualification pour les pièces du lot : refus qui nomme les qualifications", async () => {
    const tables = dossier();
    // 4 pièces du dossier de référence + 96 autres, soit 100 identifiants (une seule lecture) portant 11 versions chacune.
    for (let i = 0; i < 96; i++) tables.ecritures.push(piece(`piece${i}`, { categorie: "Divers", montant: 10 }));
    for (let i = 0; i < 96; i++) for (let v = 1; v <= 11; v++) tables.fiscal_qualifications_ecritures.push(qualification(`piece${i}`, v, { nature: "a_qualifier", rubrique: null }));
    await expect(lire(base(tables))).rejects.toThrow(TRONQUEES("des qualifications fiscales"));
  });

  it("aucune lecture n'atteint le plafond : le document se génère, jamais le message de plafond", async () => {
    const tables = dossier();
    for (let i = 0; i < 400; i++) tables.ecritures.push(piece(`depense${i}`, { categorie: "Divers", montant: 10 }));
    const recap = await lire(base(tables));
    expect(recap.nbEcritures).toBe(404);
  });

  it("une lecture en erreur garde son message habituel (elle n'est pas confondue avec un plafond)", async () => {
    const b = baseSimulee(dossier(), { plafondLignes: 1000, lecturesEnErreur: { fiscal_encaissements_composantes: "panne" } });
    await expect(chargerRecapitulatifNu(b.client, "org", "lot", 2026)).rejects.toThrow("Les données du dossier n’ont pas pu être chargées. Réessayez avant de générer ce document.");
  });
});
