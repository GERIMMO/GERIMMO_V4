/**
 * Lot « fiscal-charges », décisions du dirigeant du 14/10/2026 sur l'écran du récapitulatif fiscal :
 *  · D03 (FIN-07, option A) : une dépense rangée d'office en « fonds de travaux ALUR » ne voit jamais sa qualification appliquée ;
 *    l'écran le dit. La règle de priorité n'a PAS changé (la variante B attend la validation fiscale) : les montants restent ceux d'avant.
 *  · D02 (FIN-11, option A) : l'écran annonce le nombre de pièces à qualifier. Aucune reprise automatique, aucun outil de reprise.
 *
 * Jeu de référence du complément de D02 et D03 : appel de fonds de 800,00 € qualifié « déductible 224 », loyers de 840,00 € sans capture.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { baseSimulee, filtresDe, lecturesSansFiltreOrganisation, type BaseSimulee, type Ligne } from "./fixtures/base-simulee";

// La base est SIMULÉE avec ses filtres (fixtures/base-simulee) : les lignes d'une autre organisation, d'une autre année ou d'un autre lot
// que le jeu de données mélange à celles du dossier ne sont écartées QUE par les filtres du code testé.
const banc = vi.hoisted(() => ({
  base: null as unknown,
  rpc: vi.fn(),
  role: "proprietaire_direct",
}));
const baseCourante = () => banc.base as BaseSimulee;
const supabase = {
  from: (table: string) => baseCourante().client.from(table),
  rpc: (...args: unknown[]) => banc.rpc(...args),
};

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(), redirect: vi.fn(), unstable_rethrow: vi.fn() }));
vi.mock("@/lib/espace", () => ({
  verifierAccesEspace: async () => ({ supabase, estProprietaire: true, role: "proprietaire_direct", user: { id: "u" } }),
}));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ supabase, user: { id: "u" }, role: banc.role }),
}));

import { RecapitulatifFiscal as PageRecap } from "../src/components/recapitulatif-fiscal";
import {
  fondsTravauxAlurQualificationIgnoree,
  phrasePiecesAQualifier,
  recapitulatifFiscal,
  type EcritureFiscale,
  type QualificationFiscale,
} from "../src/lib/fiscal";
import { csvRecapitulatifFiscal } from "../src/lib/fiscal-export";
import { qualifierPieceFiscale } from "../src/app/actions/fiscalite";

const texteDe = (html: string) =>
  html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;|’/g, "'").replace(/[  ]/g, " ").replace(/\s+/g, " ");

const EXERCICE = {
  lot_id: "lot", annee: 2026, version: 1, justification: "Acte et bail vérifiés", regularisation230: 0,
  quote_part230: 100, justification230: "Décompte N−1 : zéro confirmé",
  periodes: [{ debut: "2026-01-01", fin: "2026-12-31", quote_part: 100, regime: "nu" }],
};
const ecriture = (id: string, categorie: string, sens: string, montant: number, extra: Partial<EcritureFiscale> = {}) =>
  ({ id, categorie, sens, montant, date_piece: "2026-10-12", lot_id: "lot", bail_id: null, encaissement_id: null, libelle: null, ...extra });
const qualification = (ecriture_id: string, nature: string, rubrique: string | null) =>
  ({ ecriture_id, lot_id: "lot", nature, rubrique, justification: "Facture approuvée en assemblée", version: 1 });
const AUTRE_ORGANISATION = "autre-org";
// Le même libellé « fonds de travaux ALUR » ou son contraire : la jumelle d'une autre organisation dit l'inverse de la pièce du dossier.
const jumelleEtrangere = (e: Ligne): Ligne => ({
  ...e, organization_id: AUTRE_ORGANISATION,
  categorie: String(e.categorie).toLowerCase().includes("fonds") ? "Travaux plomberie" : "Appel de fonds travaux ravalement",
});

async function page(compact = false) {
  return texteDe(renderToStaticMarkup(await PageRecap({
    params: Promise.resolve({ orgId: "org" }), searchParams: Promise.resolve({ annee: "2026" }), compact,
  })));
}
function fixture(ecritures: unknown[], qualifications: unknown[] = [], composantes: unknown[] = []) {
  const deLOrganisation = (lignes: unknown[]) => lignes.map((l) => ({ organization_id: "org", ...(l as Ligne) }));
  const lignesEcritures = deLOrganisation(ecritures);
  banc.base = baseSimulee({
    // Avant les bonnes lignes : une pièce de même identifiant dans une autre organisation, une pièce de l'an dernier.
    ecritures: [
      ...lignesEcritures.map(jumelleEtrangere),
      { ...ecriture("ancienne", "Travaux plomberie", "depense", 321, { date_piece: "2025-10-12" }), organization_id: "org" },
      ...lignesEcritures,
    ],
    fiscal_qualifications_ecritures: [
      ...(qualifications as Ligne[]).map((q) => ({ ...q, organization_id: AUTRE_ORGANISATION, nature: "non_deductible", rubrique: null, version: 9 })),
      ...deLOrganisation(qualifications),
    ],
    fiscal_encaissements_composantes: deLOrganisation(composantes),
    // Exercices plus récents que le bon : l'an dernier (hors périmètre), un autre lot, une autre organisation.
    fiscal_exercices_lots: [
      { ...EXERCICE, organization_id: "org", annee: 2025, version: 3, periodes: [{ debut: "2025-01-01", fin: "2025-12-31", quote_part: 100, regime: "hors_perimetre" }] },
      { ...EXERCICE, organization_id: "org", lot_id: "lot-tiers", version: 4, periodes: [{ debut: "2026-01-01", fin: "2026-12-31", quote_part: 100, regime: "hors_perimetre" }] },
      { ...EXERCICE, organization_id: AUTRE_ORGANISATION, version: 5, periodes: [{ debut: "2026-01-01", fin: "2026-12-31", quote_part: 100, regime: "hors_perimetre" }] },
      { ...EXERCICE, organization_id: "org" },
    ],
    lots: [{ organization_id: AUTRE_ORGANISATION, id: "lot", nom: "Lot d'une autre agence" }, { organization_id: "org", id: "lot", nom: "Lot A" }],
    biens: [],
  });
}
const exercices = new Map([["lot", EXERCICE as never]]);

beforeEach(() => {
  banc.rpc.mockReset().mockResolvedValue({ data: "ecriture", error: null });
  banc.role = "proprietaire_direct";
  fixture([]);
});

describe("D03 (FIN-07, option A) : l'écran dit que le choix de qualification n'est pas appliqué au fonds de travaux ALUR", () => {
  const appel = ecriture("alur", "Appel de fonds travaux ravalement 2026", "depense", 800);
  const qualifiee = [qualification("alur", "deductible", "224")];

  it("la règle de priorité ne change pas : 800,00 € restent à part, rien en 224", () => {
    const recap = recapitulatifFiscal([appel], 2026, {
      exigerPerimetre: true, exercices, qualifications: new Map(qualifiee.map((q) => [q.ecriture_id, q as never])),
    });
    expect(recap.fondsTravauxAlur).toBe(800);
    expect(recap.rubriques.find((r) => r.code === "224")!.montant).toBe(0);
    expect(recap.totalCharges).toBe(0);
    expect(recap.ecrituresFondsTravauxAlur).toEqual(["alur"]);
  });

  it("repère les pièces rangées d'office dont une qualification est enregistrée, et seulement celles-là", () => {
    const sansChoix = ecriture("alur2", "Cotisation fonds de travaux", "depense", 120);
    const recap = recapitulatifFiscal([appel, sansChoix], 2026, { exigerPerimetre: true, exercices });
    const qualifications = new Map<string, QualificationFiscale>(qualifiee.map((q) => [q.ecriture_id, q as never]));
    expect(recap.ecrituresFondsTravauxAlur.sort()).toEqual(["alur", "alur2"]);
    expect(fondsTravauxAlurQualificationIgnoree(recap, qualifications)).toEqual(["alur"]);
    qualifications.set("alur", { ...qualifiee[0], nature: "a_qualifier", rubrique: null } as never);
    expect(fondsTravauxAlurQualificationIgnoree(recap, qualifications)).toEqual([]);
  });

  it("la carte « Fonds travaux ALUR » nomme la pièce dont le choix est ignoré", async () => {
    fixture([appel], qualifiee);
    const texte = await page();
    expect(texte).toContain("Fonds travaux ALUR — à part");
    expect(texte).toContain("800,00 €");
    expect(texte).toContain("Votre choix de qualification n'est pas appliqué");
    expect(texte).toContain("Appel de fonds travaux ravalement 2026");
    expect(texte).toContain("déductible 224");
  });

  it("sans qualification, la carte ne parle pas d'un choix ignoré", async () => {
    fixture([appel]);
    const texte = await page();
    expect(texte).toContain("Fonds travaux ALUR — à part");
    expect(texte).not.toContain("Votre choix de qualification n'est pas appliqué");
  });

  it("la pièce, dans « Qualifier les pièces », porte l'avertissement avant même la qualification", async () => {
    fixture([appel]);
    const texte = await page();
    expect(texte).toContain("rangée d'office en « fonds de travaux ALUR »");
    expect(texte).toContain("n'est pas appliqué au récapitulatif");
  });

  it("une dépense ordinaire ne porte aucun avertissement de ce genre", async () => {
    fixture([ecriture("tx", "Travaux plomberie", "depense", 800)]);
    const texte = await page();
    expect(texte).not.toContain("rangée d'office");
    expect(texte).not.toContain("Fonds travaux ALUR — à part");
  });

  it("l'enregistrement d'une qualification sur une pièce ALUR le dit dans le message de succès", async () => {
    fixture([appel]);
    const saisie = new FormData();
    saisie.set("confirme", "oui"); saisie.set("nature", "deductible"); saisie.set("rubrique", "224");
    saisie.set("lot_id", "lot"); saisie.set("justification", "Facture approuvée en assemblée");
    const retour = await qualifierPieceFiscale("org", "alur", {}, saisie);
    expect(banc.rpc).toHaveBeenCalledWith("qualifier_ecriture_fiscale", expect.objectContaining({ p_ecriture: "alur", p_nature: "deductible", p_rubrique: "224" }));
    expect(retour.erreur).toBeUndefined();
    expect(retour.succes).toContain("Qualification conservée");
    expect(retour.succes?.replace(/’/g, "'")).toContain("n'est pas appliqué");
    expect(retour.succes).toContain("fonds de travaux ALUR");
  });

  it("une pièce ordinaire garde le message de succès d'avant", async () => {
    fixture([ecriture("tx", "Travaux plomberie", "depense", 800)]);
    const saisie = new FormData();
    saisie.set("confirme", "oui"); saisie.set("nature", "deductible"); saisie.set("rubrique", "224");
    saisie.set("lot_id", "lot"); saisie.set("justification", "Facture");
    const retour = await qualifierPieceFiscale("org", "tx", {}, saisie);
    expect(retour.succes).toBe("Qualification conservée dans une nouvelle version. Le journal reste inchangé.");
  });
});

describe("D02 (FIN-11, option A) : le récapitulatif annonce le nombre de pièces à qualifier", () => {
  const loyers = [1, 2, 3].map((m) => ecriture(`loyer${m}`, "loyer", "recette", 840, { bail_id: "bail", encaissement_id: `enc${m}`, date_piece: `2026-0${m}-05` }));

  it("compte les pièces et, parmi elles, les loyers sans répartition justifiée", () => {
    const recap = recapitulatifFiscal([...loyers, ecriture("d1", "Divers", "depense", 40)], 2026, { exigerPerimetre: true, exercices });
    expect(recap.ecrituresAQualifier).toHaveLength(4);
    expect(recap.ecrituresLoyersSansVentilation.sort()).toEqual(["loyer1", "loyer2", "loyer3"]);
    expect(phrasePiecesAQualifier(recap)).toBe(
      "4 pièces restent à qualifier, une par une, avant que ce récapitulatif soit complet, dont 3 loyers encaissés sans répartition justifiée entre loyer et charges."
      + " Les loyers encaissés avant la mise en place de la ventilation fiscale ne sont pas repris automatiquement : chacun se qualifie dans « Qualifier les pièces ».",
    );
  });

  it("une seule pièce se dit au singulier ; rien à qualifier, rien à dire", () => {
    const une = recapitulatifFiscal([ecriture("d1", "Divers", "depense", 40)], 2026, { exigerPerimetre: true, exercices });
    expect(phrasePiecesAQualifier(une)).toBe("1 pièce reste à qualifier avant que ce récapitulatif soit complet.");
    expect(phrasePiecesAQualifier(recapitulatifFiscal([], 2026, { exigerPerimetre: true, exercices }))).toBeNull();
  });

  it("les montants du récapitulatif ne changent pas : les loyers non ventilés restent hors totaux", () => {
    const recap = recapitulatifFiscal(loyers, 2026, { exigerPerimetre: true, exercices });
    expect(recap.rubriques.find((r) => r.code === "211")!.montant).toBe(0);
    expect(recap.aQualifier).toBe(2520);
  });

  it("l'écran complet annonce le nombre de pièces", async () => {
    fixture(loyers);
    const texte = await page();
    expect(texte).toContain("3 pièces restent à qualifier, une par une, avant que ce récapitulatif soit complet, dont 3 loyers encaissés");
    expect(texte).toContain("ne sont pas repris automatiquement");
  });

  it("l'encart de la page Finances (vue compacte) l'annonce aussi", async () => {
    fixture(loyers);
    const texte = await page(true);
    expect(texte).toContain("3 pièces restent à qualifier");
  });

  it("l'export CSV porte la même phrase que l'écran", () => {
    const recap = recapitulatifFiscal(loyers, 2026, { exigerPerimetre: true, exercices });
    expect(csvRecapitulatifFiscal(recap, 2026)).toContain('"À compléter";"3 pièces restent à qualifier, une par une, avant que ce récapitulatif soit complet, dont 3 loyers encaissés');
  });

  it("un récapitulatif complet n'annonce rien", async () => {
    fixture([ecriture("tx", "Assurance PNO", "depense", 100)], [qualification("tx", "deductible", "223")]);
    const texte = await page();
    expect(texte).not.toContain("restent à qualifier");
    expect(texte).not.toContain("reste à qualifier");
  });
});

describe("lecture du livre : bornée à l'organisation et à l'année affichées (base simulée avec ses filtres)", () => {
  const appel = ecriture("alur", "Appel de fonds travaux ravalement 2026", "depense", 800);

  it("toutes les lectures de l'écran portent l'organisation ; les écritures sont bornées à l'année, l'exercice est celui de l'année", async () => {
    fixture([appel], [qualification("alur", "deductible", "224")]);
    await page();
    const base = baseCourante();
    expect(lecturesSansFiltreOrganisation(base, "org")).toEqual([]);
    expect(filtresDe(base, "ecritures")).toEqual(expect.arrayContaining([
      { op: "gte", col: "date_piece", val: "2026-01-01" },
      { op: "lte", col: "date_piece", val: "2026-12-31" },
    ]));
    expect(filtresDe(base, "fiscal_exercices_lots")).toContainEqual({ op: "eq", col: "annee", val: 2026 });
  });

  it("une pièce de l'an dernier, d'une autre organisation ou d'un exercice qui n'est pas celui de l'année n'entre pas dans le récapitulatif", async () => {
    fixture([appel], [qualification("alur", "deductible", "224")]);
    const texte = await page();
    // Une seule pièce du dossier, 800 € : ni les 321 € de l'an dernier, ni la jumelle d'une autre organisation (qui dirait l'inverse).
    expect(texte).toContain("800,00 €");
    expect(texte).not.toContain("321,00 €");
    expect(texte).toContain("Votre choix de qualification n'est pas appliqué");
    expect(texte).not.toContain("Travaux plomberie");
  });

  it("le message de succès d'une qualification lit la pièce de l'organisation, pas sa jumelle d'une autre (dans les deux sens)", async () => {
    fixture([appel, ecriture("tx", "Travaux plomberie", "depense", 300)]);
    const saisie = (piece: string) => {
      const f = new FormData();
      f.set("confirme", "oui"); f.set("nature", "deductible"); f.set("rubrique", "224");
      f.set("lot_id", "lot"); f.set("justification", "Facture approuvée en assemblée");
      return qualifierPieceFiscale("org", piece, {}, f).then((r) => ({ ...r, piece }));
    };
    expect((await saisie("alur")).succes).toContain("fonds de travaux ALUR");
    expect((await saisie("tx")).succes).toBe("Qualification conservée dans une nouvelle version. Le journal reste inchangé.");
    const lectures = filtresDe(baseCourante(), "ecritures").filter((f) => f.col === "organization_id");
    expect(lectures.every((f) => f.val === "org")).toBe(true);
  });
});
