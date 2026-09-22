/**
 * La ronde mensuelle du territoire — ses verrous, et le lien entre les crons
 * déclarés et le proxy.
 *
 * Le 18/09, une route de tâche neuve n'était pas dans la liste exemptée de
 * session : elle aurait été renvoyée vers la connexion et rien ne serait
 * jamais parti. Le dernier test ci-dessous rend cet oubli impossible : chaque
 * chemin de `vercel.json` doit passer le proxy sans cookie.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/cron/territoire/route";

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
import { proxy } from "../src/proxy";

const SECRET = "secret-de-recette-suffisamment-long";
const appel = (entete?: string) =>
  new Request("https://exemple.fr/api/cron/territoire", {
    headers: entete ? { authorization: entete } : {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null } }) } });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("la ronde refuse plutôt que de s'ouvrir", () => {
  it("sans CRON_SECRET, elle ne tourne pas", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const r = await GET(appel(`Bearer ${SECRET}`));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ erreur: expect.stringContaining("CRON_SECRET") });
  });

  it("sans en-tête, ou avec le mauvais secret : 401", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await GET(appel())).status).toBe(401);
    expect((await GET(appel("Bearer faux"))).status).toBe(401);
    expect((await GET(appel(`Bearer ${"x".repeat(SECRET.length)}`))).status).toBe(401);
    expect((await GET(appel(SECRET))).status).toBe(401);
  });

  it("avec le bon secret mais sans clé de service, elle s'arrête aussi", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const r = await GET(appel(`Bearer ${SECRET}`));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ erreur: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY") });
  });
});

describe("chaque tâche déclarée passe le proxy sans session", () => {
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf-8")) as {
    crons: { path: string; schedule: string }[];
  };

  it("déclare la collecte et l’étude territoriale quotidiennes", () => {
    expect(vercel.crons.find((c) => c.path === "/api/cron/territoire")?.schedule).toBe("0 5 * * *");
  });

  it.each(vercel.crons.map((c) => c.path))("%s n'est pas renvoyé vers la connexion", async (path) => {
    const r = await proxy(new NextRequest(`https://gerimmo.test${path}`));
    expect(r.headers.get("location")).toBeNull();
    expect(r.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.client).not.toHaveBeenCalled();
  });
});
