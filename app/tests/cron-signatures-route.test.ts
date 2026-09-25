/**
 * La tâche des signatures, quand Youtrust n'est pas en production (25/09).
 *
 * Elle répondait 503 AVANT de consigner : Santé disait « aucune exécution » à
 * vie et Équipes « À vérifier » chaque nuit, pour une sandbox choisie. La passe
 * consigne désormais qu'elle n'a rien pu traiter, et répond 200.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ consigner: vi.fn(), client: vi.fn() }));
vi.mock("@/lib/tache", async (importer) => ({
  ...(await importer<typeof import("@/lib/tache")>()),
  consignerTache: mocks.consigner,
}));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: mocks.client }));
import { GET } from "../src/app/api/cron/signatures/route";

const SECRET = "secret-de-recette-suffisamment-long";
const appel = () => new Request("https://exemple.fr/api/cron/signatures", { headers: { authorization: `Bearer ${SECRET}` } });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("Youtrust absent ou en sandbox", () => {
  it.each([
    ["absent", "", "youtrust_absent"],
    ["en sandbox", "yt_test", "youtrust_sandbox"],
  ])("Youtrust %s : la passe est consignée « non configurée » et répond 200", async (_, cle, motif) => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("YOUTRUST_API_KEY", cle);
    vi.stubEnv("YOUTRUST_ENV", "sandbox");
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
