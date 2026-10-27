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
const LOT_C = "00000000-0000-4000-8000-0000000001c3";
const AUTRE_BIEN = "00000000-0000-4000-8000-000000000b02";
const PIECE = "00000000-0000-4000-8000-00000000d0c1";
const AUTRE_PIECE = "00000000-0000-4000-8000-00000000d0c2";

type Piece = { id: string; titre: string | null; type: string; organization_id: string; purged_at: string | null; partage_le?: string | null };
// Une ligne de la table `diagnostics`, telle que la requête « pièce déjà utilisée » peut la rencontrer.
type LigneDiagnostic = {
  id: string; organization_id: string; document_id: string; type: string;
  lot_id: string | null; bien_id: string | null; archived_at: string | null;
};

const banc = vi.hoisted(() => ({
  ecritures: [] as { table: string; ligne: unknown }[],
  lectures: [] as { table: string; filtres: Record<string, unknown> }[],
  piece: null as Piece | null,
  // Les diagnostics déjà enregistrés : le faux magasin applique à cette table les MÊMES filtres que la vraie requête.
  diagnostics: [] as LigneDiagnostic[],
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
        && (filtres.type_in === undefined || (filtres.type_in as string[]).includes(p.type))
        && (filtres.purged_at_is === undefined || (filtres.purged_at_is === null && p.purged_at === null));
      return ok ? { id: p!.id, titre: p!.titre, type: p!.type, partage_le: p!.partage_le ?? null } : null;
    }
    if (table === "diagnostics") {
      // Chaque filtre posé par l'action doit être satisfait par la ligne (`xxx_is` : colonne `is null`). Un filtre retiré
      // ou changé de colonne laisse donc passer des lignes qu'il aurait dû écarter, et un test le voit.
      const correspond = (ligne: LigneDiagnostic) => Object.entries(filtres).every(([cle, valeur]) => {
        if (cle.endsWith("_is")) return ligne[cle.slice(0, -3) as keyof LigneDiagnostic] === valeur;
        return ligne[cle as keyof LigneDiagnostic] === valeur;
      });
      const trouvee = banc.diagnostics.find(correspond);
      return trouvee ? { id: trouvee.id } : null;
    }
    return null;
  };
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (colonne: string, valeur: unknown) => { filtres[colonne] = valeur; return q; },
    is: (colonne: string, valeur: unknown) => { filtres[`${colonne}_is`] = valeur; return q; },
    in: (colonne: string, valeurs: unknown[]) => { filtres[`${colonne}_in`] = valeurs; return q; },
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
// Un diagnostic actif de ce lot sur cette pièce, sauf ce que `surcharge` change.
const diagnosticExistant = (surcharge: Partial<LigneDiagnostic> = {}): LigneDiagnostic => ({
  id: "diag-existant", organization_id: ORG, document_id: PIECE, type: "dpe", lot_id: LOT_B, bien_id: null, archived_at: null, ...surcharge,
});

beforeEach(() => {
  vi.clearAllMocks();
  banc.ecritures.length = 0;
  banc.lectures.length = 0;
  banc.piece = pieceDiagnostic();
  banc.diagnostics = [];
  banc.erreurInsertion = null;
  banc.depot.mockResolvedValue({
    erreur: "Un fichier au contenu strictement identique existe déjà dans la GED, sous le nom « DPE — 13/10/2026 ». Rattachez cette pièce existante plutôt que de la déposer en double.",
    doublonId: PIECE,
  });
});

describe("X07 : le refus de doublon propose la pièce existante", () => {
  it("renvoie la pièce déjà rangée pour que l'écran propose « utiliser cette pièce pour ce lot »", async () => {
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire());
    // DOC-02 : la proposition porte aussi le type de la pièce, pour que l'écran annonce un éventuel reclassement.
    expect(r.pieceExistante).toEqual({ id: PIECE, titre: "DPE — 13/10/2026", type: "diagnostic" });
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
    for (const racine of ["agence", "espace"]) {
      expect(banc.revalider).toHaveBeenCalledWith(`/${racine}/${ORG}/parc/${BIEN}`);
      expect(banc.revalider).toHaveBeenCalledWith(`/${racine}/${ORG}/parc`);
      expect(banc.revalider).toHaveBeenCalledWith(`/${racine}/${ORG}/documents`);
      expect(banc.revalider).toHaveBeenCalledWith(`/${racine}/${ORG}/baux`, "layout");
    }
    expect(banc.revalider.mock.calls.some(([chemin]) => chemin.includes("/lots/"))).toBe(false);
  });

  it("filtre la pièce par organisation, type et pièce vivante", async () => {
    await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE }));
    const lecture = banc.lectures.find((l) => l.table === "documents");
    // DOC-02 : un rapport rangé d'abord en « Autre » ou « Courrier » s'utilise aussi (la base le reclasse).
    expect(lecture?.filtres).toMatchObject({ id: PIECE, organization_id: ORG, type_in: ["diagnostic", "autre", "courrier"], purged_at_is: null });
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
    banc.diagnostics = [diagnosticExistant()];
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE }));
    expect(r.erreur).toMatch(/déjà utilisée pour ce lot/);
    expect(insertionsDiagnostic()).toHaveLength(0);
  });

  it("refuse de même pour un diagnostic du bien : la pièce sert déjà à ce bien pour ce type", async () => {
    banc.diagnostics = [diagnosticExistant({ type: "erp", lot_id: null, bien_id: BIEN })];
    const r = await deposerDiagnostic(ORG, BIEN, null, {}, formulaire({ type: "erp", date_expiration: "2026-07-10", piece_existante: PIECE }));
    expect(r.erreur).toMatch(/déjà utilisée pour ce bien/);
    expect(insertionsDiagnostic()).toHaveLength(0);
  });

  it("lit les diagnostics avec exactement les filtres attendus (organisation, pièce, type, lot, actif) pour un lot", async () => {
    await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE }));
    const lecture = banc.lectures.find((l) => l.table === "diagnostics");
    expect(lecture?.filtres).toEqual({ organization_id: ORG, document_id: PIECE, type: "dpe", archived_at_is: null, lot_id: LOT_B });
  });

  it("lit les diagnostics avec exactement les filtres attendus (organisation, pièce, type, bien, actif) pour un bien", async () => {
    await deposerDiagnostic(ORG, BIEN, null, {}, formulaire({ type: "erp", date_expiration: "2026-07-10", piece_existante: PIECE }));
    const lecture = banc.lectures.find((l) => l.table === "diagnostics");
    expect(lecture?.filtres).toEqual({ organization_id: ORG, document_id: PIECE, type: "erp", archived_at_is: null, bien_id: BIEN });
  });

  // Ce qui ne doit PAS faire refuser : chaque cas retire une raison de refuser, un filtre manquant ou mal posé les confond.
  it.each([
    ["le lot a déjà un AUTRE diagnostic du même type (autre rapport)", { document_id: AUTRE_PIECE }],
    ["un diagnostic ARCHIVÉ sur cette pièce n'empêche pas le rattachement", { archived_at: "2026-09-01T00:00:00Z" }],
    ["la pièce sert déjà à un AUTRE lot du même immeuble", { lot_id: LOT_C }],
    ["la pièce sert déjà au lot pour un AUTRE type de diagnostic", { type: "electricite" }],
    ["la ligne appartient à une AUTRE organisation", { organization_id: AUTRE_ORG }],
  ] as [string, Partial<LigneDiagnostic>][])("accepte la pièce quand %s", async (_nom, surcharge) => {
    banc.diagnostics = [diagnosticExistant(surcharge)];
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE }));
    expect(r.erreur).toBeUndefined();
    expect(insertionsDiagnostic()).toHaveLength(1);
  });

  it("accepte la pièce pour un bien quand elle sert déjà à un AUTRE bien (ou à un lot) pour ce type", async () => {
    banc.diagnostics = [
      diagnosticExistant({ type: "erp", lot_id: null, bien_id: AUTRE_BIEN }),
      diagnosticExistant({ id: "diag-lot", type: "erp", lot_id: LOT_B, bien_id: null }),
    ];
    const r = await deposerDiagnostic(ORG, BIEN, null, {}, formulaire({ type: "erp", date_expiration: "2026-07-10", piece_existante: PIECE }));
    expect(r.erreur).toBeUndefined();
    expect(insertionsDiagnostic()).toHaveLength(1);
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
    for (const racine of ["agence", "espace"]) {
      expect(banc.revalider).toHaveBeenCalledWith(`/${racine}/${ORG}/parc/${BIEN}/lots/${LOT_B}`);
      expect(banc.revalider).toHaveBeenCalledWith(`/${racine}/${ORG}/parc/${BIEN}`);
      expect(banc.revalider).toHaveBeenCalledWith(`/${racine}/${ORG}/parc`);
      expect(banc.revalider).toHaveBeenCalledWith(`/${racine}/${ORG}/documents`);
      expect(banc.revalider).toHaveBeenCalledWith(`/${racine}/${ORG}/baux`, "layout");
    }
  });
});

// DOC-02 (audit #264) : le même rapport, d'abord rangé dans Documents en « Autre » (ou « Courrier », ou joint au bail
// comme annexe), était refusé comme doublon sans aucune issue : le lot restait bloqué sur « DPE absent ».
describe("DOC-02 : un rapport déjà rangé en « Autre » ou « Courrier » se déclare comme diagnostic", () => {
  it.each(["autre", "courrier"])("propose la pièce de type « %s » avec son type", async (type) => {
    banc.piece = pieceDiagnostic({ type, titre: "VDD-DPE-2019-v2" });
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire());
    expect(r.pieceExistante).toEqual({ id: PIECE, titre: "VDD-DPE-2019-v2", type });
    expect(insertionsDiagnostic()).toHaveLength(0);
  });

  it("crée le diagnostic sur cette pièce et dit qu'elle est reclassée, sans nouveau dépôt ni écriture de document", async () => {
    banc.piece = pieceDiagnostic({ type: "autre", titre: "VDD-DPE-2019-v2" });
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE }, false));
    expect(r.erreur).toBeUndefined();
    expect(r.succes).toMatch(/« VDD-DPE-2019-v2 ».*classée en « Diagnostic »/);
    expect(banc.depot).not.toHaveBeenCalled();
    expect(insertionsDiagnostic()[0].ligne).toMatchObject({ lot_id: LOT_B, type: "dpe", document_id: PIECE });
    // Le reclassement est fait par la base, dans la transaction du diagnostic (déclencheur) : rien côté application.
    expect(banc.ecritures.filter((e) => e.table === "documents" || e.table === "document_liens")).toHaveLength(0);
  });

  it("ne dit rien de plus pour un rapport déjà classé « Diagnostic »", async () => {
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE }));
    expect(r.succes).not.toMatch(/classée/);
  });

  it.each(["justificatif", "piece_identite", "attestation_assurance"])("ne propose ni n'accepte une pièce personnelle (« %s »)", async (type) => {
    banc.piece = pieceDiagnostic({ type });
    expect((await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire())).pieceExistante).toBeUndefined();
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE }));
    expect(r.erreur).toMatch(/plus disponible/);
    expect(insertionsDiagnostic()).toHaveLength(0);
  });
});

// DOC-02, relecture : un courrier mis à disposition du locataire n'apparaît dans son espace que tant qu'il reste un
// courrier. Le reclasser en « Diagnostic » le lui retirait en silence : il n'est ni proposé ni accepté, et le refus dit
// comment faire.
describe("DOC-02 : un courrier mis à disposition du locataire n'est pas reclassé en silence", () => {
  beforeEach(() => {
    banc.piece = pieceDiagnostic({ type: "courrier", titre: "DPE partagé", partage_le: "2026-10-20T10:00:00Z" });
  });

  it("ne propose pas la pièce au refus de doublon et dit pourquoi", async () => {
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire());
    expect(r.pieceExistante).toBeUndefined();
    expect(r.erreur).toMatch(/mis à disposition de votre locataire.*retirez d’abord la mise à disposition/);
    expect(insertionsDiagnostic()).toHaveLength(0);
  });

  it("refuse la pièce passée directement, sans rien écrire", async () => {
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ piece_existante: PIECE }, false));
    expect(r.succes).toBeUndefined();
    expect(r.erreur).toMatch(/mis à disposition de votre locataire/);
    expect(banc.ecritures).toHaveLength(0);
  });

  it("propose de nouveau le courrier une fois la mise à disposition retirée", async () => {
    banc.piece = pieceDiagnostic({ type: "courrier", titre: "DPE partagé", partage_le: null });
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire());
    expect(r.pieceExistante).toEqual({ id: PIECE, titre: "DPE partagé", type: "courrier" });
  });

  it("garde la proposition d'un rapport déjà classé « Diagnostic », même marqué partagé (rien à retirer au locataire)", async () => {
    banc.piece = pieceDiagnostic({ partage_le: "2026-10-20T10:00:00Z" });
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire());
    expect(r.pieceExistante).toEqual({ id: PIECE, titre: "DPE — 13/10/2026", type: "diagnostic" });
  });
});

// DOC-01 (audit #264) : décret n° 2020-1610 — un DPE réalisé du 01/01/2018 au 30/06/2021 ne vaut que jusqu'au 31/12/2024.
describe("DOC-01 : l'échéance d'un DPE d'avant juillet 2021 ne dépasse pas le plafond réglementaire", () => {
  it("refuse un DPE de 2019 déclaré valable jusqu'en 2029, sans rien déposer", async () => {
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ date_realisation: "2019-05-10", date_expiration: "2029-05-10" }));
    expect(r.erreur).toMatch(/31\/12\/2024.*2020-1610/);
    expect(banc.depot).not.toHaveBeenCalled();
    expect(insertionsDiagnostic()).toHaveLength(0);
  });

  it("accepte ce DPE avec l'échéance plafonnée", async () => {
    banc.depot.mockResolvedValue({ documentId: "00000000-0000-4000-8000-00000000d0c9" });
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, formulaire({ date_realisation: "2019-05-10", date_expiration: "2024-12-31" }));
    expect(r.erreur).toBeUndefined();
    expect(insertionsDiagnostic()[0].ligne).toMatchObject({ date_realisation: "2019-05-10", date_expiration: "2024-12-31" });
  });
});

// DOC-07 (audit #264) : un CREP qui relève du plomb vaut six ans pour la location (art. R. 1334-11 du CSP).
describe("DOC-07 : le résultat du CREP décide de son échéance", () => {
  const crep = (extra: Record<string, string>) => formulaire({ type: "plomb", date_realisation: "2015-06-01", date_expiration: "", classe_dpe: "", ...extra });

  it("refuse un constat positif sans échéance", async () => {
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, crep({ plomb_resultat: "presence" }));
    expect(r.erreur).toMatch(/six ans/);
    expect(banc.depot).not.toHaveBeenCalled();
  });

  it("accepte un constat négatif sans échéance (sans limite de validité)", async () => {
    banc.depot.mockResolvedValue({ documentId: "00000000-0000-4000-8000-00000000d0c9" });
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, crep({ plomb_resultat: "absence" }));
    expect(r.erreur).toBeUndefined();
    expect(insertionsDiagnostic()[0].ligne).toMatchObject({ type: "plomb", date_expiration: null });
  });

  it("accepte un constat positif avec son échéance à six ans", async () => {
    banc.depot.mockResolvedValue({ documentId: "00000000-0000-4000-8000-00000000d0c9" });
    const r = await deposerDiagnostic(ORG, BIEN, LOT_B, {}, crep({ plomb_resultat: "presence", date_expiration: "2021-06-01" }));
    expect(r.erreur).toBeUndefined();
    expect(insertionsDiagnostic()[0].ligne).toMatchObject({ type: "plomb", date_expiration: "2021-06-01" });
  });
});
