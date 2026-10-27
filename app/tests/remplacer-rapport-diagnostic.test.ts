/**
 * DOC-03 (audit de la refonte #264) — « Nouvelle version » d'un rapport de diagnostic dans Documents n'avait aucun effet
 * sur le lot : la RPC remplacer_document_ged ne déplace pas diagnostics.document_id, et la fiche du lot comme le bail
 * continuaient d'ouvrir l'ancien fichier, masqué de la bibliothèque. Un rapport en service se renouvelle sur sa fiche
 * (nouvelles dates, ancien diagnostic archivé) : l'action refuse avant tout dépôt, l'écran propose le bon chemin.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const banc = vi.hoisted(() => ({
  diagnostics: [] as { id: string }[],
  filtres: [] as [string, unknown][],
  upload: vi.fn(),
  rpc: vi.fn(),
}));

function requete(table: string) {
  const q: Record<string, unknown> = {
    select: () => q,
    eq: (colonne: string, valeur: unknown) => { banc.filtres.push([`${table}.${colonne}`, valeur]); return q; },
    is: (colonne: string, valeur: unknown) => { banc.filtres.push([`${table}.${colonne}_is`, valeur]); return q; },
    limit: () => q,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: table === "diagnostics" ? banc.diagnostics : [], error: null }).then(ok),
  };
  return q;
}

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({
  verifierGerant: async () => ({
    user: { id: "gerant" }, role: "proprietaire_direct",
    supabase: { from: requete, rpc: banc.rpc, storage: { from: () => ({ upload: banc.upload }) } },
  }),
}));

import { remplacerDocument } from "../src/app/actions/documents-ged";

const PDF = "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n";
function formulaire() {
  const f = new FormData();
  f.set("fichier", new File([PDF], "dpe-v3.pdf", { type: "application/pdf" }));
  return f;
}

beforeEach(() => {
  banc.diagnostics = [];
  banc.filtres = [];
  banc.upload.mockReset();
  banc.rpc.mockReset();
});

describe("DOC-03 : un rapport de diagnostic en service ne se remplace pas depuis Documents", () => {
  it("refuse avant tout dépôt et renvoie vers la fiche du lot ou du bien", async () => {
    banc.diagnostics = [{ id: "diag" }];
    const r = await remplacerDocument("org", "piece", {}, formulaire());
    expect(r.erreur).toMatch(/renouvelez-le depuis la fiche du lot ou du bien/);
    expect(banc.upload).not.toHaveBeenCalled();
    expect(banc.rpc).not.toHaveBeenCalled();
  });

  it("cherche un diagnostic ACTIF de cette organisation qui cite la pièce", async () => {
    banc.diagnostics = [{ id: "diag" }];
    await remplacerDocument("org", "piece", {}, formulaire());
    expect(banc.filtres).toEqual(expect.arrayContaining([
      ["diagnostics.organization_id", "org"], ["diagnostics.document_id", "piece"], ["diagnostics.archived_at_is", null],
    ]));
  });

  it("laisse passer une pièce qu'aucun diagnostic actif ne cite", async () => {
    banc.upload.mockResolvedValue({ error: { message: "arrêt du test après la garde" } });
    const r = await remplacerDocument("org", "piece", {}, formulaire());
    expect(banc.upload).toHaveBeenCalledTimes(1);
    expect(r.erreur).toMatch(/arrêt du test après la garde/);
  });
});
