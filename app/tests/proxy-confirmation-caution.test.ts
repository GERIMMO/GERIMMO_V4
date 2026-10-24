/**
 * Le lien envoyé à la caution (décision du dirigeant du 23/10/2026) : SEUL /signature/caution/<jeton de 43 caractères>
 * est traversable sans session, sur le modèle de l'invitation d'un artisan. Toute autre adresse sous /signature mène à
 * la connexion ; la réponse de la page n'est jamais gardée en cache.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import nextConfig from "../next.config";

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
import { proxy } from "../src/proxy";

const JETON = "Ab0_-".repeat(8) + "xyz";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null } }) } });
});
const versConnexion = async (chemin: string) => {
  const reponse = await proxy(new NextRequest(`https://gerimmo.test${chemin}`));
  return { connexion: reponse.headers.get("location")?.includes("/connexion") ?? false, statut: reponse.status };
};

describe("sans session", () => {
  it("le lien de l'e-mail s'ouvre", async () => {
    expect(JETON).toHaveLength(43);
    expect((await versConnexion(`/signature/caution/${JETON}`)).connexion).toBe(false);
  });

  it.each(["/signature", "/signature/caution", `/signature/caution/${JETON}x`, `/signature/caution/${JETON}/autre`, "/signature/caution/court", `/signature/autre/${JETON}`])(
    "%s mène à la connexion (adresse connue, non publique)",
    async (chemin) => {
      const r = await versConnexion(chemin);
      expect(r.connexion).toBe(true);
      expect(r.statut).not.toBe(404);
    },
  );
});

it("la page du lien n'est jamais gardée en cache", async () => {
  const entetes = await nextConfig.headers!();
  expect(entetes.find((e) => e.source === "/signature/caution/:path*")?.headers).toEqual([{ key: "Cache-Control", value: "no-store" }]);
});

describe("relecture du 24/10 : une session Gerimmo expirée ne détourne pas la confirmation de la caution", () => {
  const HIER = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  function sessionExpiree(erreurSession = false) {
    const q = { select: vi.fn(() => q), eq: vi.fn(() => q), then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ role: "proprietaire_direct" }], error: null }).then(ok) };
    const signOut = vi.fn(async () => ({ error: null }));
    mocks.client.mockReturnValue({
      from: () => q,
      rpc: async () => (erreurSession ? { data: null, error: { message: "indisponible" } } : { data: [{ id: "session-fictive", cree_le: HIER }], error: null }),
      auth: { getUser: async () => ({ data: { user: { id: "compte", last_sign_in_at: HIER } } }), signOut },
    });
    return signOut;
  }

  it("l'envoi du formulaire (POST) passe, sans renvoi vers /connexion ni jeton dans une adresse", async () => {
    const signOut = sessionExpiree();
    const r = await proxy(new NextRequest(`https://gerimmo.test/signature/caution/${JETON}`, { method: "POST" }));
    expect(r.headers.get("location")).toBeNull();
    expect(r.status).toBe(200);
    expect(signOut).toHaveBeenCalled();
  });

  it("session illisible : le POST de la caution passe aussi", async () => {
    sessionExpiree(true);
    const r = await proxy(new NextRequest(`https://gerimmo.test/signature/caution/${JETON}`, { method: "POST" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("location")).toBeNull();
  });

  it("toute autre adresse privée garde la redirection de sécurité", async () => {
    sessionExpiree();
    const r = await proxy(new NextRequest("https://gerimmo.test/agence/123/biens", { method: "POST" }));
    expect(r.headers.get("location")).toContain("/connexion");
  });
});
