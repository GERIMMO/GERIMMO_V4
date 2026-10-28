/**
 * DRT-05, relecture du 28/10/2026 : la marque du premier mot de passe d'un invité s'efface dès qu'une session ouverte
 * par mot de passe passe le proxy (connexion ordinaire, sans le lien d'invitation).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ client: vi.fn(), updateUserById: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ auth: { admin: { updateUserById: mocks.updateUserById } } }) }));
import { proxy } from "@/proxy";

function session(appMetadata: Record<string, unknown>, methodes: string[]) {
  const q = { select: vi.fn(() => q), eq: vi.fn(() => q), then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ role: "locataire" }], error: null }).then(ok) };
  mocks.client.mockReturnValue({
    from: () => q,
    rpc: async () => ({ data: [{ id: "s", cree_le: new Date().toISOString() }], error: null }),
    auth: {
      getUser: async () => ({ data: { user: { id: "invite", app_metadata: appMetadata, factors: [] } } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1", currentAuthenticationMethods: methodes.map((method) => ({ method, timestamp: 1 })) }, error: null }) },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateUserById.mockResolvedValue({ data: {}, error: null });
});

describe("la marque du premier mot de passe", () => {
  it("s'efface quand une session par mot de passe passe le proxy", async () => {
    session({ premier_mot_de_passe: true }, ["password"]);
    await proxy(new NextRequest("https://gerimmo.test/locataire/org"));
    expect(mocks.updateUserById).toHaveBeenCalledWith("invite", { app_metadata: { premier_mot_de_passe: false } });
  });
  it("reste tant que la session vient du lien (récupération), et rien n'est appelé sans marque", async () => {
    session({ premier_mot_de_passe: true }, ["recovery"]);
    await proxy(new NextRequest("https://gerimmo.test/locataire/org"));
    session({}, ["password"]);
    await proxy(new NextRequest("https://gerimmo.test/locataire/org"));
    expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
});
