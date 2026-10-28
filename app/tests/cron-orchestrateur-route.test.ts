/**
 * La route /api/cron/orchestrateur (suivi des dossiers) : secret exigé, service requis, résultat jamais mis en cache
 * (audit final du 27/10, COD-16 : `force-dynamic` ne pose aucun en-tête sur un Route Handler). Le GET est exécuté pour de
 * bon, avec le client de service et l'orchestration simulés.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ db: null as unknown, orchestrer: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => m.db }));
vi.mock("@/lib/orchestrateur", () => ({ orchestrerDossiers: m.orchestrer }));

import { GET } from "../src/app/api/cron/orchestrateur/route";

const SECRET = "secret-de-recette-suffisamment-long";
const appel = (secret: string | null = SECRET) =>
  new Request("https://gerimmo.test/api/cron/orchestrateur", secret === null ? undefined : { headers: { authorization: `Bearer ${secret}` } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
  m.db = { rpc: vi.fn() };
  m.orchestrer.mockResolvedValue({ dossiers: 3, rapports_prepares: 1, erreur: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/cron/orchestrateur", () => {
  it("refuse sans le secret (401), sans orchestrer, et la réponse ne se met pas en cache", async () => {
    for (const secret of [null, "", "mauvais-secret-de-la-meme-longueur-x"]) {
      const r = await GET(appel(secret));
      expect(r.status).toBe(401);
      expect(r.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(m.orchestrer).not.toHaveBeenCalled();
  });

  it("sans client de service : 503, sans cache", async () => {
    m.db = null;
    const r = await GET(appel());
    expect(r.status).toBe(503);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(m.orchestrer).not.toHaveBeenCalled();
  });

  it("avec le secret : orchestre une fois et rend le résultat, sans cache ; une erreur de passe donne 500", async () => {
    const r = await GET(appel());
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(await r.json()).toEqual({ dossiers: 3, rapports_prepares: 1, erreur: null });
    expect(m.orchestrer).toHaveBeenCalledTimes(1);
    m.orchestrer.mockResolvedValue({ dossiers: 0, rapports_prepares: 0, erreur: "La passe n'a pas pu aboutir." });
    const echec = await GET(appel());
    expect(echec.status).toBe(500);
    expect(echec.headers.get("Cache-Control")).toBe("no-store");
  });
});
