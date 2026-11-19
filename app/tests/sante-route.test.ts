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
  vi.restoreAllMocks();
  service.client = null;
});

const SECRET = "secret-des-taches-de-recette";
const avecSecret = (secret = SECRET) => new Request("https://exemple.fr/api/sante", { headers: { authorization: `Bearer ${secret}` } });

describe("la route de santé", () => {
  // TEC-3 (19/11/2026) : la route est publique. Une panne s'y dit en termes généraux ; le nom de la variable absente va
  // au journal du serveur, et à la ronde qui porte le secret des tâches.
  it("sans clé de service, répond 503 sans nommer la variable à un appelant anonyme — jamais ok", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "0123456789abcdef");
    vi.stubEnv("CRON_SECRET", SECRET);
    for (const requete of [new Request("https://exemple.fr/api/sante"), avecSecret("un-autre-secret-de-meme-taille")]) {
      const r = await GET(requete);
      expect(r.status).toBe(503);
      const corps = await r.json();
      expect(corps).toEqual({ ok: false, base: false, commit: "0123456", revision: null, motif: "Service momentanément indisponible." });
      expect(JSON.stringify(corps)).not.toMatch(/SUPABASE|SERVICE_ROLE|absente/i);
    }
    expect(journal).toHaveBeenCalledWith(expect.stringContaining("[sante]"), expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"));
    journal.mockRestore();
  });

  it("sans clé de service, la ronde qui porte le secret des tâches lit la cause exacte", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("CRON_SECRET", SECRET);
    const r = await GET(avecSecret());
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ ok: false, base: false, motif: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY") });
  });

  it("base injoignable : 503, motif général pour un appelant anonyme, l'erreur de la base au journal seulement", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    const sha = "0123456789abcdef0123456789abcdef01234567";
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", sha);
    service.client = {
      from: () => ({ select: () => ({ limit: async () => ({ data: null, error: { code: "PGRST301", message: "relation interne introuvable" } }) }) }),
    };
    const r = await GET(new Request("https://exemple.fr/api/sante"));
    expect(r.status).toBe(503);
    const corps = await r.json();
    expect(corps).toEqual({ ok: false, base: false, commit: "0123456", revision: sha, motif: "Service momentanément indisponible." });
    expect(JSON.stringify(corps)).not.toContain("PGRST301");
    expect(JSON.stringify(corps)).not.toContain("relation interne");
    expect(JSON.stringify(journal.mock.calls)).toContain("PGRST301");
    journal.mockRestore();
  });

  it("ne renvoie pas de commit quand Vercel n'en donne pas", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    const r = await GET(new Request("https://exemple.fr/api/sante"));
    expect(await r.json()).toMatchObject({ commit: null, revision: null });
  });
  it("expose la révision complète pour vérifier la version exacte publiée", async () => {
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
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

  // Le contrat lu par le contrôle de publication (scripts/deploiement/controle.mjs, `santeConforme` et `maintenance`) et
  // par la surveillance de disponibilité (scripts/surveillance/disponibilite.mjs) : mêmes champs, même forme.
  it("réponse saine sans secret : exactement ok, base, commit, revision et maintenance", async () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", sha);
    service.client = { from: () => ({ select: () => ({ limit: async () => ({ data: [], error: null }) }) }) };
    const r = await GET(new Request("https://exemple.fr/api/sante"));
    expect(r.status).toBe(200);
    const corps = await r.json();
    expect(Object.keys(corps).sort()).toEqual(["base", "commit", "maintenance", "ok", "revision"]);
    expect(corps).toMatchObject({ ok: true, base: true, commit: "0123456", revision: sha });
    expect(typeof corps.maintenance).toBe("boolean");
  });
});
