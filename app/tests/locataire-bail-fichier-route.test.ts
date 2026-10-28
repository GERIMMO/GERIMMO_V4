/**
 * La route du bail signé du locataire (`/locataire/[orgId]/bail/fichier`) et le gabarit de la balance d'ouverture
 * (`/agence/[orgId]/comptabilite/reprise/modele`). Audit final du 27/10 (COD-15) : aucun test ne les citait.
 *
 * Bail : droits puis trace AVANT tout lien signé — 403 sans adhésion locataire (autre organisation comprise), 503 quand la
 * lecture échoue, 404 sans bail signé, 410 purgé, 500 si la trace n'est pas confirmée ; chaque page d'erreur est servie
 * sans cache. Gabarit : CSV en pièce jointe, jamais mis en cache.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const b = vi.hoisted(() => ({
  orgLocataire: "organisation",
  lectureErreur: false, traceErreur: false,
  doc: null as null | { document_id: string; titre: string | null; mime_type: string; storage_path: string | null; purged_at: string | null },
  rpc: vi.fn(), signer: vi.fn(),
}));
vi.mock("@/lib/ged-acces", () => ({
  // L'adhésion locataire n'existe que dans UNE organisation : ailleurs, pas d'utilisateur.
  verifierLocataire: async (orgId: string) => ({ supabase: { rpc: b.rpc }, user: orgId === b.orgLocataire ? { id: "locataire" } : null }),
}));
vi.mock("@/lib/fichier-signe", () => ({ servirFichierSigne: b.signer }));

import { GET as bail } from "@/app/locataire/[orgId]/bail/fichier/route";
import { GET as gabarit } from "@/app/agence/[orgId]/comptabilite/reprise/modele/route";

const appeler = (orgId = "organisation", recherche = "") =>
  bail(new NextRequest(`https://gerimmo.example.invalid/locataire/${orgId}/bail/fichier${recherche}`), { params: Promise.resolve({ orgId }) });

beforeEach(() => {
  vi.clearAllMocks();
  b.lectureErreur = false; b.traceErreur = false;
  b.doc = { document_id: "document", storage_path: "organisation/bail.pdf", titre: "Bail signé", mime_type: "application/pdf", purged_at: null };
  b.rpc.mockImplementation(async (nom: string) =>
    nom === "mon_bail_document_locataire" ? { data: b.doc ? [b.doc] : [], error: b.lectureErreur ? {} : null } : { error: b.traceErreur ? {} : null });
  b.signer.mockResolvedValue(new Response("lecture autorisée"));
});

describe("le bail signé du locataire : droits et trace avant le lien", () => {
  it("refuse sans session (403), sans lire ni signer, et la page d'erreur n'est pas mise en cache", async () => {
    b.orgLocataire = "aucune";
    const r = await appeler();
    expect(r.status).toBe(403);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(b.rpc).not.toHaveBeenCalled();
    expect(b.signer).not.toHaveBeenCalled();
    b.orgLocataire = "organisation";
  });

  it("refuse l'adresse d'une autre organisation (403) : l'adhésion locataire ne vaut que dans la sienne", async () => {
    expect((await appeler("autre-organisation")).status).toBe(403);
    expect(b.rpc).not.toHaveBeenCalled();
  });

  it("une lecture en échec donne 503, pas « bail introuvable »", async () => {
    b.lectureErreur = true;
    const r = await appeler();
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("introuvable");
    expect(b.signer).not.toHaveBeenCalled();
  });

  it("sans bail signé : 404 ; purgé : 410 ; dans les deux cas aucun lien", async () => {
    b.doc = null;
    expect((await appeler()).status).toBe(404);
    b.doc = { document_id: "document", storage_path: "organisation/bail.pdf", titre: "Bail", mime_type: "application/pdf", purged_at: "2026-10-01" };
    expect((await appeler()).status).toBe(410);
    expect(b.signer).not.toHaveBeenCalled();
  });

  it("sans trace confirmée au journal d'accès : 500 et aucun lien", async () => {
    b.traceErreur = true;
    expect((await appeler()).status).toBe(500);
    expect(b.signer).not.toHaveBeenCalled();
  });

  it("journalise la consultation puis signe le lien ; le téléchargement et l'aperçu intégré sont transmis", async () => {
    expect((await appeler()).status).toBe(200);
    expect(b.rpc).toHaveBeenCalledWith("log_document_access", { doc: "document", acces: "consultation" });
    expect(b.rpc.mock.invocationCallOrder.at(-1)).toBeLessThan(b.signer.mock.invocationCallOrder[0]);
    expect(b.signer).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ path: "organisation/bail.pdf", mode: "consultation", apercuIntegre: false }));
    await appeler("organisation", "?mode=telechargement&apercu=integre");
    expect(b.rpc).toHaveBeenCalledWith("log_document_access", { doc: "document", acces: "telechargement" });
    expect(b.signer).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ mode: "telechargement", apercuIntegre: true }));
  });
});

describe("le gabarit de la balance d'ouverture", () => {
  it("sert un CSV en pièce jointe, sans cache, avec l'en-tête des colonnes lues par la reprise", async () => {
    const r = await gabarit();
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(r.headers.get("Content-Disposition")).toBe('attachment; filename="gerimmo-balance-ouverture.csv"');
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    const corps = await r.text();
    expect(corps.split(/\r?\n/)[0]).toMatch(/;/);
  });
});
