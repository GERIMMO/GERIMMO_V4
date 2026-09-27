/**
 * Une quittance introuvable répond 404 (audit du 27/09).
 *
 * La page se rend en flux sous le « Chargement… » racine : un notFound() posé
 * pendant le rendu partait en 200. Le proxy vérifie donc, avant tout flux et
 * sous la session du visiteur, que le document existe pour lui.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const mocks = vi.hoisted(() => ({ client: vi.fn(), rpc: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));

beforeEach(() => {
  vi.clearAllMocks();
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [{ role: "locataire" }], error: null }).then(resolve),
  };
  mocks.client.mockReturnValue({
    from: () => q,
    rpc: mocks.rpc,
    auth: {
      getUser: async () => ({ data: { user: { id: "compte", last_sign_in_at: new Date().toISOString() } } }),
    },
  });
});

const ID = "9ccce3bb-7fd2-43c8-9962-2deb6f45497b";

describe("le lien de quittance d'un e-mail", () => {
  it("document inconnu ou d'un autre : statut 404 et page « introuvable »", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const r = await proxy(new NextRequest(`https://gerimmo.test/quittance/${ID}`));
    expect(r.status).toBe(404);
    expect(r.headers.get("x-middleware-rewrite")).toContain("/_introuvable");
    expect(mocks.rpc).toHaveBeenCalledWith("quittance_document", { p_quittance: ID });
  });

  it("un identifiant qui n'est pas un UUID : 404 sans interroger la base", async () => {
    const r = await proxy(new NextRequest("https://gerimmo.test/quittance/pas-un-document"));
    expect(r.status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("document lisible : la page s'ouvre", async () => {
    mocks.rpc.mockResolvedValue({ data: { quittance_id: ID }, error: null });
    const r = await proxy(new NextRequest(`https://gerimmo.test/quittance/${ID}?imprimer=1`));
    expect(r.status).toBe(200);
    expect(r.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("une panne de lecture ne se déguise pas en « introuvable »", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "indisponible" } });
    const r = await proxy(new NextRequest(`https://gerimmo.test/quittance/${ID}`));
    expect(r.status).toBe(200);
  });
});
