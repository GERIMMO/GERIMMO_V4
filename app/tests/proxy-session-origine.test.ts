import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ACTIVITY_COOKIE, signerActivite } from "../src/lib/session-policy";
const mocks = vi.hoisted(() => ({ client: vi.fn(), signOut: vi.fn(), rpc: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
import { proxy } from "../src/proxy";
const maintenant = Date.now();
const sessionId = "11111111-1111-4111-8111-111111111111";
function preparer(age: number) {
  const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ role: "super_admin" }], error: null }).then(resolve) };
  mocks.rpc.mockResolvedValue({ data: [{ id: sessionId, cree_le: new Date(maintenant - age).toISOString() }], error: null });
  const client = { from: () => q, rpc: mocks.rpc, auth: {
    getUser: async () => ({ data: { user: { id: "compte", last_sign_in_at: new Date(maintenant).toISOString() } } }),
    signOut: mocks.signOut,
    mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal2" }, error: null }) },
  } };
  mocks.client.mockReturnValue(client);
  mocks.signOut.mockResolvedValue({ error: null });
  return client;
}
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("GERIMMO_SESSION_SECRET", "secret-fictif-local"); });
afterEach(() => vi.unstubAllEnvs());
describe("durée de chaque session", () => {
  it("une connexion récente sur un autre appareil ne prolonge pas cette session", async () => {
    preparer(9 * 3600000);
    const cookie = await signerActivite(maintenant, `compte:${sessionId}`, "session:secret-fictif-local");
    const r = await proxy(new NextRequest("https://gerimmo.test/admin", { headers: { cookie: `${ACTIVITY_COOKIE}=${cookie}` } }));
    expect(r.headers.get("location")).toContain("raison=session-expiree");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("l'activité d'une autre session ne réveille pas une session inactive", async () => {
    preparer(40 * 60000);
    const cookie = await signerActivite(maintenant, "compte:autre-session", "session:secret-fictif-local");
    const r = await proxy(new NextRequest("https://gerimmo.test/admin", { headers: { cookie: `${ACTIVITY_COOKIE}=${cookie}` } }));
    expect(r.headers.get("location")).toContain("raison=session-expiree");
  });
  it("conserve une session récente", async () => {
    preparer(60000);
    expect((await proxy(new NextRequest("https://gerimmo.test/admin"))).headers.get("location")).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith("ma_session_active");
  });
  it("une session absente du registre est fermée", async () => {
    preparer(60000); mocks.rpc.mockResolvedValue({ data: [], error: null });
    const r = await proxy(new NextRequest("https://gerimmo.test/admin"));
    expect(r.headers.get("location")).toContain("session-expiree");
  });
  it("une lecture indisponible refuse la page sans effacer la session", async () => {
    preparer(60000); mocks.rpc.mockResolvedValue({ data: null, error: { message: "indisponible" } });
    expect((await proxy(new NextRequest("https://gerimmo.test/admin"))).status).toBe(503);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it.each(["session", "adhesions"])("conserve les cookies renouvelés quand la lecture %s échoue", async (source) => {
    const client = preparer(60000);
    if (source === "session") mocks.rpc.mockResolvedValue({ data: null, error: { message: "indisponible" } });
    else {
      const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "indisponible" } }).then(resolve) };
      client.from = () => q;
    }
    mocks.client.mockImplementation((_url: unknown, _key: unknown, options: { cookies: { setAll: (cookies: { name: string; value: string }[]) => void } }) => {
      options.cookies.setAll([{ name: "session-renouvelee", value: "valeur-fictive" }]);
      return client;
    });
    const r = await proxy(new NextRequest("https://gerimmo.test/admin"));
    expect(r.status).toBe(503);
    expect(r.cookies.get("session-renouvelee")?.value).toBe("valeur-fictive");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
