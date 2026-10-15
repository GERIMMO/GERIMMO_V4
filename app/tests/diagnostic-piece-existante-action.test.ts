/**
 * X07 (PROP-11) — un même rapport PDF (DPE collectif d'un immeuble) doit pouvoir servir à plusieurs lots
 * SANS être déposé deux fois.
 *
 * Avant : le second dépôt du même fichier était refusé (« Rattachez cette pièce existante plutôt que de la
 * déposer en double ») mais aucun geste ne permettait de la rattacher.
 * Maintenant :
 *  - le refus de doublon d'un rapport de diagnostic propose la pièce existante (`pieceExistante`) ;
 *  - l'action « utiliser cette pièce pour ce lot » (champ `piece_existante`) crée le diagnostic du lot
 *    sur la pièce DÉJÀ rangée, sans nouveau dépôt ni nouvelle fiche document ;
 *  - la pièce doit appartenir à l'organisation, être un rapport de diagnostic vivant, et ne pas déjà servir
 *    à ce même lot / bien pour ce type.
 * La base garde en plus la frontière d'organisation (tests/diagnostic-piece-partagee-base.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "00000000-0000-4000-8000-0000000000a1";
const AUTRE_ORG = "00000000-0000-4000-8000-0000000000b2";
const BIEN = "00000000-0000-4000-8000-000000000b01";
const LOT_B = "00000000-0000-4000-8000-0000000001b2";
const PIECE = "00000000-0000-4000-8000-00000000d0c1";

type Piece = { id: string; titre: string | null; type: string; organization_id: string; purged_at: string | null };

const banc = vi.hoisted(() => ({
  ecritures: [] as { table: string; ligne: unknown }[],
  lectures: [] as { table: string; filtres: Record<string, unknown> }[],
  piece: null as Piece | null,
  dejaUtilisee: false,
  erreurInsertion: null as null | { message: string },
  depot: vi.fn(),
  revalider: vi.fn(),
}));

function constructeur(table: string) {
  const filtres: Record<string, unknown> = {};
  const resoudre = () => {
    banc.lectures.push({ table, filtres: { ...filtres } });
    if (table === "documents") {
      const p = banc.piece;
      // Le faux magasin applique les mêmes filtres que la vraie requête (organisation, type, pièce vivante).
      const ok = p && filtres.id === p.id && filtres.organization_id === p.organization_id
        && (filtres.type === undefined || filtres.type === p.type)
        && (filtres.purged_at_is === undefined || (filtres.purged_at_is === null && p.purged_at === null));
      return ok ? { id: p!.id, titre: p!.titre, type: p!.type } : null;
    }
    if (table === "diagnostics") return banc.dejaUtilisee ? { id: "diag-existant" } : null;
    return null;
  };
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (colonne: string, valeur: unknown) => { filtres[colonne] = valeur; return q; },
    is: (colonne: string, valeur: unknown) => { filtres[`${colonne}_is`] = valeur; return q; },
    limit: () => q,
    maybeSingle: async () => ({ data: resoudre(), error: null }),
    insert: async (ligne: unknown) => { banc.ecritures.push({ table, ligne }); return { error: banc.erreurInsertion }; },
    then: (resolve: (v: unknown) => unknown) => {
      const ligne = resoudre();
      return Promise.resolve({ data: ligne ? [ligne] : [], error: null }).then(resolve);
    },
  };
  return q;
}

vi.mock("next/cache", () => ({ revalidatePath: banc.revalider }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({ user: { id: "gerant" }, supabase: { from: constructeur } }),
}));
vi.mock("@/lib/ged-depot", () => ({ deposerFichierGed: banc.depot }));

import { deposerDiagnostic } from "../src/app/actions/parc";

function formulaire(extra: Record<string, string | File> = {}, avecFichier = true) {
  const f = new FormData();
  const base: Record<string, string> = { type: "dpe", date_realisation: "2026-01-10", date_expiration: "2036-01-10", classe_dpe: "D" };
  for (const [k, v] of Object.entries(base)) f.set(k, v);
  if (avecFichier) f.set("fichier", new File([new Uint8Array([37, 80, 68, 70])], "dpe-immeuble.pdf", { type: "application/pdf" }));
  for (const [k, v] of Object.entries(extra)) f.set(k, v);
  return f;
}
const pieceDiagnostic = (surcharge: Partial<Piece> = {}): Piece =>
  ({ id: PIECE, titre: "DPE — 13/10/2026", type: "diagnostic", organization_id: ORG, purged_at: null, ...surcharge });
const insertionsDiagnostic = () => banc.ecritures.filter((e) => e.table === "diagnostics");

beforeEach(() => {
  vi.clearAllMocks();
  banc.ecritures.length = 0;
  banc.lectures.length = 0;
  banc.piece = pieceDiagnostic();
  banc.dejaUtilisee = false;
  banc.erreurInsertion = null;
  banc.depot.mockResolvedValue({
    erreur: "Un fichier au contenu strictement identique existe déjà dans la GED, sous le nom « DPE — 13/10/2026 ». Rattachez cette pièce existante plutôt que de la déposer en double.",
    doublonId: PIECE,
  });
});

describe("X07 : le refus de doublon propose la pièce existante", () => {
  it("renvoie la pièce déjà rangée pour que l'écran propose « utiliser cette pièce pour ce lot »", async () => {
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire());
    expect(r.pieceExistante).toEqual({ id: PIECE, titre: "DPE — 13/10/2026" });
    expect(r.erreur).toMatch(/contenu strictement identique/);
    expect(r.succes).toBeUndefined();
    expect(insertionsDiagnostic()).toHaveLength(0);
  });

  it("ne propose rien quand le doublon n'est pas un rapport de diagnostic (pièce d'identité, quittance…)", async () => {
    banc.piece = pieceDiagnostic({ type: "identite" });
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire());
    expect(r.pieceExistante).toBeUndefined();
    expect(r.erreur).toMatch(/contenu strictement identique/);
  });

  it("ne propose rien quand la pièce n'est pas visible de cette organisation", async () => {
    banc.piece = pieceDiagnostic({ organization_id: AUTRE_ORG });
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire());
    expect(r.pieceExistante).toBeUndefined();
  });
});

describe("X07 : utiliser la pièce existante pour ce lot", () => {
  it("crée le diagnostic du lot sur la pièce déjà rangée, sans nouveau dépôt", async () => {
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE }));
    expect(r.erreur).toBeUndefined();
    expect(r.succes).toMatch(/sans copie supplémentaire/);
    expect(banc.depot).not.toHaveBeenCalled();
    expect(insertionsDiagnostic()).toHaveLength(1);
    expect(insertionsDiagnostic()[0].ligne).toMatchObject({
      organization_id: ORG, lot_id: LOT_B, bien_id: null, type: "dpe", document_id: PIECE, classe_dpe: "D",
      date_realisation: "2026-01-10", date_expiration: "2036-01-10",
    });
    // Aucune fiche document n'est créée : la pièce est partagée, pas dupliquée.
    expect(banc.ecritures.filter((e) => e.table === "documents" || e.table === "document_liens")).toHaveLength(0);
  });

  it("n'exige pas de fichier : la pièce existe déjà", async () => {
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE }, false));
    expect(r.erreur).toBeUndefined();
    expect(insertionsDiagnostic()).toHaveLength(1);
  });

  it("fonctionne aussi pour un diagnostic rattaché au bien (ERP, amiante des parties communes)", async () => {
    const r = await deposerDiagnostic(ORG, BIEN, null, {}, formulaire({ type: "erp", date_expiration: "2026-07-10", piece_existante: PIECE }));
    expect(r.erreur).toBeUndefined();
    expect(insertionsDiagnostic()[0].ligne).toMatchObject({ bien_id: BIEN, lot_id: null, type: "erp", document_id: PIECE });
  });

  it("filtre la pièce par organisation, type et pièce vivante", async () => {
    await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE }));
    const lecture = banc.lectures.find((l) => l.table === "documents");
    expect(lecture?.filtres).toMatchObject({ id: PIECE, organization_id: ORG, type: "diagnostic", purged_at_is: null });
  });

  it("refuse une pièce d'une autre organisation : aucune écriture", async () => {
    banc.piece = pieceDiagnostic({ organization_id: AUTRE_ORG });
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE }));
    expect(r.erreur).toMatch(/plus disponible/);
    expect(r.succes).toBeUndefined();
    expect(insertionsDiagnostic()).toHaveLength(0);
    expect(banc.depot).not.toHaveBeenCalled();
  });

  it("refuse une pièce qui n'est pas un rapport de diagnostic", async () => {
    banc.piece = pieceDiagnostic({ type: "identite" });
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE }));
    expect(r.erreur).toMatch(/plus disponible/);
    expect(insertionsDiagnostic()).toHaveLength(0);
  });

  it("refuse une pièce effacée (purgée)", async () => {
    banc.piece = pieceDiagnostic({ purged_at: "2026-10-01T00:00:00Z" });
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE }));
    expect(r.erreur).toMatch(/plus disponible/);
    expect(insertionsDiagnostic()).toHaveLength(0);
  });

  it("refuse un identifiant mal formé sans interroger les documents", async () => {
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: "pas-un-identifiant" }));
    expect(r.erreur).toMatch(/plus disponible/);
    expect(banc.lectures.filter((l) => l.table === "documents")).toHaveLength(0);
    expect(insertionsDiagnostic()).toHaveLength(0);
  });

  it("refuse de rattacher deux fois la même pièce au même lot pour le même type", async () => {
    banc.dejaUtilisee = true;
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE }));
    expect(r.erreur).toMatch(/déjà utilisée pour ce lot/);
    expect(insertionsDiagnostic()).toHaveLength(0);
  });

  it("garde les contrôles de saisie : date de réalisation obligatoire", async () => {
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE, date_realisation: "" }));
    expect(r.erreur).toMatch(/date de réalisation/);
    expect(insertionsDiagnostic()).toHaveLength(0);
  });

  it("ne confirme rien quand la base refuse le diagnostic (lot hors du portefeuille de l'agent, par exemple)", async () => {
    banc.erreurInsertion = { message: "new row violates row-level security policy for table \"diagnostics\"" };
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE }));
    expect(r.erreur).toBeTruthy();
    expect(r.succes).toBeUndefined();
    expect(banc.revalider).not.toHaveBeenCalled();
  });
});

describe("X07 : le dépôt d'un nouveau fichier reste inchangé", () => {
  it("dépose et lie le nouveau rapport comme avant", async () => {
    banc.depot.mockResolvedValue({ documentId: "00000000-0000-4000-8000-00000000d0c9" });
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire());
    expect(r.erreur).toBeUndefined();
    expect(banc.depot).toHaveBeenCalledTimes(1);
    expect(insertionsDiagnostic()[0].ligne).toMatchObject({ document_id: "00000000-0000-4000-8000-00000000d0c9", lot_id: LOT_B });
  });
});
