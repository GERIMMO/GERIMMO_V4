/**
 * Le document d'une quittance pour l'aperçu en fenêtre de « Mes documents »
 * (décision du 27/10, audit #264 ED-04) : lu sous la session de l'appelant par
 * `quittance_document`, délivré seulement complet, jamais mis en cache.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CSS_POLICES } from "@/lib/documents/polices";
import { quittanceDocumentComplete } from "./fixtures/quittance-document";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mocks.rpc }) }));

import { GET } from "@/app/quittance/[quittanceId]/document/route";

const ID = "9ccce3bb-7fd2-43c8-9962-2deb6f45497b";
const appeler = (quittanceId: string) =>
  GET(new Request(`https://gerimmo.test/quittance/${quittanceId}/document`), { params: Promise.resolve({ quittanceId }) });

beforeEach(() => vi.clearAllMocks());

describe("GET /quittance/[id]/document", () => {
  it("un identifiant qui n'est pas un UUID : 404 sans interroger la base", async () => {
    const r = await appeler("pas-un-document");
    expect(r.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("document inconnu ou d'un autre locataire : 404", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const r = await appeler(ID);
    expect(r.status).toBe(404);
    expect(mocks.rpc).toHaveBeenCalledWith("quittance_document", { p_quittance: ID });
    expect(await r.json()).toEqual({ erreur: expect.stringContaining("n'est pas à votre disposition") });
  });
  it("un champ obligatoire vide : le document n'est pas délivré (409), comme sur sa page", async () => {
    const q = quittanceDocumentComplete({ est_quittance: false });
    q.organisation.adresse = null;
    mocks.rpc.mockResolvedValue({ data: q, error: null });
    const r = await appeler(ID);
    expect(r.status).toBe(409);
    expect((await r.json()).erreur).toContain("Votre reçu n'est pas encore disponible");
  });
  it("document complet : le même HTML que l'écran, sans les polices du PDF, jamais mis en cache", async () => {
    mocks.rpc.mockResolvedValue({ data: quittanceDocumentComplete(), error: null });
    const r = await appeler(ID);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    const { html } = await r.json() as { html: string };
    expect(html).toMatch(/<html/i);
    expect(html).toContain("Agence Alpha");
    expect(html).not.toContain(CSS_POLICES);
    expect(html).toContain("@media screen and (max-width: 640px)");
  });
});
