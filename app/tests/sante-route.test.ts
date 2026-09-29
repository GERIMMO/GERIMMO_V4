/**
 * Le point de santé — ce qu'il dit sans secret, et ce qu'il refuse sans clé.
 *
 * Il porte la clé de service, comme les tâches : on vérifie qu'il s'arrête net
 * quand elle manque, au lieu de répondre « ok » sur du vide — un point de santé
 * qui rassure à tort est pire qu'aucun.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// Un faux client de service, posé test par test ; sinon le vrai module.
const service = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/service", async (original) => {
  const vrai = await original<typeof import("@/lib/supabase/service")>();
  return { clientDeService: () => service.client ?? vrai.clientDeService() };
});
import { GET } from "../src/app/api/sante/route";

afterEach(() => {
  vi.unstubAllEnvs();
  service.client = null;
});

describe("la route de santé", () => {
  it("sans clé de service, répond 503 et le dit — jamais ok", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "0123456789abcdef");
    const r = await GET(new Request("https://exemple.fr/api/sante"));
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({
      ok: false,
      base: false,
      commit: "0123456",
      revision: null,
      motif: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"),
    });
  });

  it("ne renvoie pas de commit quand Vercel n'en donne pas", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    const r = await GET(new Request("https://exemple.fr/api/sante"));
    expect(await r.json()).toMatchObject({ commit: null, revision: null });
  });
  it("expose la révision complète pour vérifier la version exacte publiée", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const sha = "0123456789abcdef0123456789abcdef01234567";
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", sha);
    const r = await GET(new Request("https://exemple.fr/api/sante"));
    expect(await r.json()).toMatchObject({ commit: "0123456", revision: sha });
  });

  it("sans secret, sonde la base par une ligne au plus — jamais un comptage (audit 29/09)", async () => {
    const options: unknown[] = [];
    const limites: number[] = [];
    service.client = {
      from: () => ({
        select: (_colonnes: string, opts?: unknown) => {
          options.push(opts);
          return { limit: async (n: number) => (limites.push(n), { data: [], error: null }) };
        },
      }),
    };
    const r = await GET(new Request("https://exemple.fr/api/sante"));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, base: true });
    expect(options).toEqual([undefined]);
    expect(limites).toEqual([1]);
  });
});
