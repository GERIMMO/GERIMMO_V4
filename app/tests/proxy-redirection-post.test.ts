/**
 * Audit du 30/09 (M6) : le proxy renvoyait vers /connexion en 307 quelle que
 * soit la méthode. Un 307 rejoue la méthode : le POST d'une action serveur
 * dont la session venait d'expirer était reposté sur /connexion. Pour tout ce
 * qui n'est ni GET ni HEAD, 303 — le navigateur suit en GET.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { statutRedirection } from "@/lib/redirection";

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
import { proxy } from "../src/proxy";

const HIER = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

function sansSession() {
  mocks.client.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null } }) } });
}
function sessionExpiree() {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ role: "admin_agence" }], error: null }).then(resolve),
  };
  const signOut = vi.fn(async () => ({ error: null }));
  mocks.client.mockReturnValue({
    from: () => q,
    auth: { getUser: async () => ({ data: { user: { id: "compte", last_sign_in_at: HIER } } }), signOut },
  });
  return signOut;
}

beforeEach(() => vi.clearAllMocks());

describe("statutRedirection", () => {
  it("307 pour GET et HEAD, 303 pour le reste", () => {
    expect(statutRedirection("GET")).toBe(307);
    expect(statutRedirection("HEAD")).toBe(307);
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) expect(statutRedirection(m)).toBe(303);
  });
});

describe("le proxy renvoie vers /connexion", () => {
  it("sans session : 307 en GET, 303 en POST, destination gardée", async () => {
    sansSession();
    const get = await proxy(new NextRequest("https://gerimmo.test/agence/123/biens"));
    expect(get.status).toBe(307);
    expect(get.headers.get("location")).toContain("/connexion?suite=%2Fagence%2F123%2Fbiens");
    const post = await proxy(new NextRequest("https://gerimmo.test/agence/123/biens", { method: "POST" }));
    expect(post.status).toBe(303);
    expect(post.headers.get("location")).toContain("/connexion?suite=%2Fagence%2F123%2Fbiens");
  });

  it("session expirée : 303 pour un POST (action serveur), 307 pour un GET", async () => {
    const signOut = sessionExpiree();
    const post = await proxy(new NextRequest("https://gerimmo.test/agence/123/biens", { method: "POST" }));
    expect(post.status).toBe(303);
    expect(post.headers.get("location")).toContain("raison=session-expiree");
    expect(signOut).toHaveBeenCalled();
    sessionExpiree();
    const get = await proxy(new NextRequest("https://gerimmo.test/agence/123/biens"));
    expect(get.status).toBe(307);
    expect(get.headers.get("location")).toContain("raison=session-expiree");
  });
});
