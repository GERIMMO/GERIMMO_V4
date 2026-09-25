/**
 * Aucune route de tâche morte (25/09). Deux routes (`orchestrateur`, `veille`)
 * existaient sans être planifiées ni exemptées de session : un appel direct
 * avec le secret était renvoyé vers /connexion. Chaque dossier de
 * src/app/api/cron/ et chaque chemin de vercel.json doit passer le proxy.
 */
import { readdirSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
import { proxy } from "../src/proxy";

const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf-8")) as {
  crons: { path: string; schedule: string }[];
};
const routes = readdirSync(new URL("../src/app/api/cron", import.meta.url), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => `/api/cron/${d.name}`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null } }) } });
});

describe("les routes de tâches et le proxy", () => {
  it.each(routes)("%s existe pour être appelée : le proxy la laisse passer sans session", async (path) => {
    const r = await proxy(new NextRequest(`https://gerimmo.test${path}`));
    expect(r.headers.get("location")).toBeNull();
    expect(r.headers.get("x-middleware-next")).toBe("1");
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("planifie le suivi des dossiers à part, avant les rappels", () => {
    const orchestrateur = vercel.crons.find((c) => c.path === "/api/cron/orchestrateur");
    const rappels = vercel.crons.find((c) => c.path === "/api/cron/equipes?mission=rappels");
    expect(orchestrateur?.schedule).toBe("45 5 * * *");
    expect(rappels?.schedule).toBe("0 6 * * *");
  });

  it("chaque chemin de vercel.json désigne une route qui existe", () => {
    for (const c of vercel.crons) {
      expect(routes).toContain(new URL(`https://gerimmo.test${c.path}`).pathname);
    }
  });
});
