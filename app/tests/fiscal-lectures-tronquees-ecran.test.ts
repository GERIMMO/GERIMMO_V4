import { avecDetenteursAuReel } from "./fixtures/profil-fiscal";
/**
 * Décision X12 du 14/10/2026 (fiche FIN-12), recommandation suivie : l'écran « Récapitulatif fiscal » ne lit plus TOUTES les
 * qualifications et TOUTES les captures de l'organisation (sans filtre d'année) ; il lit celles des écritures de l'année (et des
 * écritures d'origine de leurs contre-écritures), et il refuse d'afficher le moindre montant quand une lecture atteint le plafond
 * de lignes de l'API (1 000), en disant laquelle.
 *
 * Avant : un propriétaire de 20 lots sur 4 ans (plus de 1 000 captures) voyait ses loyers « à qualifier » et des recettes
 * sous-évaluées, SANS message, dans un récapitulatif à recopier sur une déclaration.
 *
 * La base est simulée AVEC un plafond de 1 000 lignes (fixtures/base-simulee, `plafondLignes`), comme PostgREST : sans lui, une
 * lecture non bornée passe pour correcte. Les lignes de bruit sont placées AVANT les bonnes : une lecture tronquée perd les bonnes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { baseSimulee, filtresDe, lecturesSansFiltreOrganisation, type BaseSimulee, type Ligne } from "./fixtures/base-simulee";

const banc = vi.hoisted(() => ({ base: null as unknown }));
const baseCourante = () => banc.base as BaseSimulee;
const supabase = { from: (table: string) => baseCourante().client.from(table), rpc: vi.fn() };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn(), unstable_rethrow: vi.fn() }));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspace: async () => ({ supabase, estProprietaire: true, role: "proprietaire_direct", user: { id: "u" } }),
}));

import { RecapitulatifFiscal as PageRecap } from "../src/components/recapitulatif-fiscal";

const texteDe = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;|’/g, "'").replace(/[  ]/g, " ").replace(/\s+/g, " ");

const o = { organization_id: "org" };
const piece = (id: string, extra: Ligne = {}): Ligne => ({
  ...o, id, lot_id: "lot", categorie: "Divers", sens: "depense", montant: 10, date_piece: "2026-03-10", bail_id: null, encaissement_id: null, libelle: null, contre_ecriture_de: null, ...extra,
});
const loyer = (m: number, extra: Ligne = {}): Ligne => piece(`loyer${m}`, {
  bail_id: "bail", encaissement_id: `enc${m}`, categorie: "loyer", sens: "recette", montant: 840, date_piece: `2026-0${m}-05`, ...extra,
});
const capture = (ecriture_id: string): Ligne => ({ ...o, ecriture_id, loyer_hc: 780, charges: 60, non_ventile: 0 });
const qualification = (ecriture_id: string, version = 1, extra: Ligne = {}): Ligne => ({
  ...o, ecriture_id, lot_id: "lot", nature: "deductible", rubrique: "224", justification: "Facture approuvée", version, ...extra,
});
const exercice: Ligne = {
  ...o, lot_id: "lot", annee: 2026, version: 1, justification: "Acte et bail vérifiés", regularisation230: 0, quote_part230: 100,
  justification230: "Décompte N−1 : zéro confirmé", periodes: [{ debut: "2026-01-01", fin: "2026-12-31", quote_part: 100, regime: "nu" }],
};

/** Trois loyers de 840 € (780 + 60) capturés : 2 340,00 € de recettes confirmées, 180,00 € de charges récupérées. */
function dossier(): Record<string, Ligne[]> {
  return {
    ecritures: [loyer(1), loyer(2), loyer(3)],
    fiscal_encaissements_composantes: [1, 2, 3].map((m) => capture(`loyer${m}`)),
    fiscal_qualifications_ecritures: [],
    fiscal_exercices_lots: [exercice],
    lots: [{ ...o, id: "lot", nom: "Lot A" }],
    biens: [],
  };
}
function poser(tables: Record<string, Ligne[]>, lecturesEnErreur?: Record<string, string>) {
  banc.base = baseSimulee(avecDetenteursAuReel(tables), { plafondLignes: 1000, lecturesEnErreur });
}
async function page(compact = false) {
  return texteDe(renderToStaticMarkup(await PageRecap({
    params: Promise.resolve({ orgId: "org" }), searchParams: Promise.resolve({ annee: "2026" }), compact,
  })));
}
/** Des qualifications et des captures de pièces d'AUTRES années : elles précèdent les bonnes dans la table. */
function bruit(n: number, tables: Record<string, Ligne[]>) {
  const qualifications: Ligne[] = [], captures: Ligne[] = [];
  for (let i = 0; i < n; i++) { qualifications.push(qualification(`ancien${i}`)); captures.push(capture(`ancien${i}`)); }
  tables.fiscal_qualifications_ecritures = [...qualifications, ...tables.fiscal_qualifications_ecritures];
  tables.fiscal_encaissements_composantes = [...captures, ...tables.fiscal_encaissements_composantes];
}

// Le texte attendu est écrit comme `texteDe` relit l'écran : apostrophe droite, espaces insécables en espaces.
const PLAFOND = (quoi: string) => `Aucun montant n'est affiché : ${quoi} a atteint la limite de 1 000 lignes et peut être incomplète.`;

beforeEach(() => poser(dossier()));

describe("X12 (FIN-12) : qualifications et captures se lisent pour les écritures de l'année, pas pour toute l'organisation", () => {
  it("1 200 captures et qualifications d'autres années placées avant les bonnes : les montants de l'année sont complets", async () => {
    const tables = dossier();
    bruit(1200, tables);
    poser(tables);
    const texte = await page();
    expect(texte).toContain("Recettes confirmées");
    expect(texte).toContain("2 340,00 €");
    expect(texte).not.toContain("À compléter");
    expect(texte).not.toContain("pièces restent à qualifier");
    expect(texte).not.toContain("Aucun montant n'est affiché");
  });

  it("les deux lectures posent un filtre `in` sur les identifiants des écritures de l'année et de leurs pièces d'origine", async () => {
    const tables = dossier();
    tables.ecritures.push(
      loyer(12, { id: "loyer-origine", date_piece: "2025-12-05" }),
      piece("loyer-inverse", { sens: "depense", categorie: "loyer", contre_ecriture_de: "loyer-origine", date_piece: "2026-02-10", montant: 840 }),
    );
    poser(tables);
    await page();
    for (const table of ["fiscal_qualifications_ecritures", "fiscal_encaissements_composantes"]) {
      const filtre = filtresDe(baseCourante(), table).find((f) => f.op === "in" && f.col === "ecriture_id");
      expect(filtre, `${table} sans filtre sur les identifiants`).toBeDefined();
      expect(filtre!.val).toEqual(expect.arrayContaining(["loyer1", "loyer2", "loyer3", "loyer-inverse", "loyer-origine"]));
    }
    expect(lecturesSansFiltreOrganisation(baseCourante(), "org")).toEqual([]);
  });

  it("la contre-écriture d'un loyer de l'an dernier retrouve la capture de sa pièce d'origine : 1 560,00 €", async () => {
    // Le filtre sur les identifiants de l'année ne doit pas perdre la pièce d'origine, datée d'une autre année.
    const tables = dossier();
    tables.ecritures.push(
      loyer(12, { id: "loyer-origine", date_piece: "2025-12-05" }),
      piece("loyer-inverse", { sens: "depense", categorie: "loyer", contre_ecriture_de: "loyer-origine", date_piece: "2026-02-10", montant: 840, encaissement_id: "enc-origine" }),
    );
    tables.fiscal_encaissements_composantes.push(capture("loyer-origine"));
    poser(tables);
    const texte = await page();
    expect(texte).toContain("1 560,00 €");
    expect(texte).not.toContain("Aucun montant n'est affiché");
  });

  it("une pièce sans lot, qualifiée pour un lot du périmètre, reste lue", async () => {
    const tables = dossier();
    tables.ecritures.push(piece("assurance", { lot_id: null, categorie: "assurance", montant: 300, date_piece: "2026-02-10" }));
    tables.fiscal_qualifications_ecritures.push(qualification("assurance", 1, { rubrique: "223" }));
    poser(tables);
    const texte = await page();
    expect(texte).toContain("300,00 €");
    expect(texte).not.toContain("pièces restent à qualifier");
  });
});

describe("X12 : une lecture qui atteint le plafond fait refuser tout montant, avec un message exact", () => {
  it("1 000 écritures dans l'année : aucun montant, et la lecture est nommée", async () => {
    const tables = dossier();
    for (let i = 0; i < 997; i++) tables.ecritures.push(piece(`depense${i}`));
    poser(tables);
    const texte = await page();
    expect(texte).toContain(PLAFOND("la lecture des écritures de 2026"));
    expect(texte).toContain("Ce n'est pas une année sans recettes ni charges");
    expect(texte).toContain("Cette limite ne se règle pas depuis cet écran : signalez-le depuis Aide et retours.");
    expect(texte).not.toContain("Recettes confirmées");
    expect(texte).not.toContain("2 340,00");
  });

  it("999 écritures : sous le plafond, les montants s'affichent comme avant", async () => {
    const tables = dossier();
    for (let i = 0; i < 996; i++) tables.ecritures.push(piece(`depense${i}`));
    poser(tables);
    const texte = await page();
    expect(texte).toContain("Recettes confirmées");
    expect(texte).not.toContain("Aucun montant n'est affiché");
  });

  it("plus de 1 000 versions de qualification pour les pièces de l'année : la lecture des qualifications est nommée", async () => {
    const tables = dossier();
    // 3 loyers + 97 autres pièces = 100 identifiants, donc UNE lecture de qualifications portant 11 versions chacune.
    for (let i = 0; i < 97; i++) tables.ecritures.push(piece(`piece${i}`));
    for (let i = 0; i < 97; i++) for (let v = 1; v <= 11; v++) tables.fiscal_qualifications_ecritures.push(qualification(`piece${i}`, v, { nature: "a_qualifier", rubrique: null }));
    poser(tables);
    const texte = await page();
    expect(texte).toContain(PLAFOND("la lecture des qualifications fiscales"));
    expect(texte).not.toContain("Recettes confirmées");
  });

  it("1 000 exercices confirmés pour l'année : la lecture des exercices est nommée", async () => {
    const tables = dossier();
    tables.fiscal_exercices_lots = Array.from({ length: 1000 }, (_, i) => ({ ...exercice, lot_id: i === 0 ? "lot" : `lot${i}` }));
    poser(tables);
    expect(await page()).toContain(PLAFOND("la lecture des exercices confirmés"));
  });

  it("1 000 lots : la lecture des lots est nommée", async () => {
    const tables = dossier();
    tables.lots = Array.from({ length: 1000 }, (_, i) => ({ ...o, id: i === 0 ? "lot" : `lot${i}`, nom: `Lot ${i}` }));
    poser(tables);
    expect(await page()).toContain(PLAFOND("la lecture des lots"));
  });

  it("deux lectures coupées sont nommées ensemble, au pluriel", async () => {
    const tables = dossier();
    tables.lots = Array.from({ length: 1000 }, (_, i) => ({ ...o, id: i === 0 ? "lot" : `lot${i}`, nom: `Lot ${i}` }));
    tables.fiscal_exercices_lots = Array.from({ length: 1000 }, (_, i) => ({ ...exercice, lot_id: i === 0 ? "lot" : `lot${i}` }));
    poser(tables);
    expect(await page()).toContain("Aucun montant n'est affiché : les lectures des exercices confirmés et des lots ont atteint la limite de 1 000 lignes et peuvent être incomplètes.");
  });

  it("la vignette de la page Finances refuse aussi, en une phrase", async () => {
    const tables = dossier();
    for (let i = 0; i < 997; i++) tables.ecritures.push(piece(`depense${i}`));
    poser(tables);
    const texte = await page(true);
    expect(texte).toContain("Récapitulatif indisponible : la lecture des écritures de 2026 a atteint la limite de 1 000 lignes et peut être incomplète. Aucun montant n'est affiché.");
    expect(texte).not.toContain("Recettes confirmées");
  });

  it("une lecture en erreur garde son message habituel (elle n'est pas confondue avec un plafond)", async () => {
    poser(dossier(), { fiscal_encaissements_composantes: "panne" });
    const texte = await page();
    expect(texte).toContain("Aucun montant n'est affiché : les composantes historiques");
    expect(texte).not.toContain("limite de 1 000 lignes");
  });
});

// Une lecture qui tombe en panne ne doit jamais se lire « zéro » : l'écran refuse tout montant et nomme la lecture, pour chacune des six lectures
// du récapitulatif (constat de relecture du 15/10 : retirer l'une d'elles de la liste des échecs ne faisait tomber aucun test).
describe("X12 : une lecture en panne fait refuser tout montant, quelle que soit la lecture", () => {
  it.each([
    ["ecritures", "les écritures"],
    ["fiscal_qualifications_ecritures", "les qualifications"],
    ["fiscal_encaissements_composantes", "les composantes historiques"],
    ["fiscal_exercices_lots", "les exercices confirmés"],
    ["lots", "les lots"],
  ])("la lecture de %s en panne : aucun montant, et %s est nommée", async (table, libelle) => {
    poser(dossier(), { [table]: "panne" });
    const texte = await page();
    expect(texte).toContain(`Aucun montant n'est affiché : ${libelle} n'`);
    expect(texte).toContain("pas pu être lu");
    expect(texte).toContain("Ce n'est pas une année sans recettes ni charges : c'est la lecture qui a échoué");
    expect(texte).not.toContain("Recettes confirmées");
    expect(texte).not.toContain("2 340,00");
    expect(texte).not.toContain("limite de 1 000 lignes");
  });

  it.each([
    ["ecritures", "les écritures"],
    ["fiscal_qualifications_ecritures", "les qualifications"],
    ["fiscal_encaissements_composantes", "les composantes historiques"],
    ["fiscal_exercices_lots", "les exercices confirmés"],
    ["lots", "les lots"],
  ])("la vignette de la page Finances : la lecture de %s en panne donne %s, jamais des zéros", async (table, libelle) => {
    poser(dossier(), { [table]: "panne" });
    const texte = await page(true);
    expect(texte).toContain(`Récapitulatif indisponible : ${libelle}.`);
    expect(texte).not.toContain("Recettes confirmées");
  });

  it("deux lectures en panne sont nommées ensemble, au pluriel", async () => {
    poser(dossier(), { fiscal_exercices_lots: "panne", lots: "panne" });
    const texte = await page();
    expect(texte).toContain("Aucun montant n'est affiché : les exercices confirmés, les lots n'ont pas pu être lues.");
  });
});
