import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ consigner: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/tache", async (importer) => ({
  ...(await importer<typeof import("@/lib/tache")>()),
  consignerTache: mocks.consigner,
}));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: mocks.client }));
import { traiterSignatures as GET } from "../src/lib/missions-planifiees/signatures";

const SECRET = "secret-de-recette-suffisamment-long";
const appel = () => new Request("https://exemple.fr/api/cron/signatures", { headers: { authorization: `Bearer ${SECRET}` } });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Zoho absent ou incomplet", () => {
  it.each([
    ["absent", "", "zoho_absent"],
    ["incomplet", "test", "zoho_absent"],
  ])("Zoho %s : la passe est consignée « non configurée » et répond 200", async (_, cle, motif) => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("ZOHO_SIGN_CLIENT_ID", cle);
    vi.stubEnv("ZOHO_SIGN_ENV", "sandbox");
    mocks.client.mockReturnValue({});
    const r = await GET(appel());
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ non_configuree: true, ignores: 0 });
    expect(mocks.consigner).toHaveBeenCalledWith({}, "signatures", expect.objectContaining({ non_configuree: true, motif }));
  });

  it("sans clé de service, elle s'arrête avant tout : 503", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    mocks.client.mockReturnValue(null);
    const r = await GET(appel());
    expect(r.status).toBe(503);
    expect(mocks.consigner).not.toHaveBeenCalled();
  });
});
