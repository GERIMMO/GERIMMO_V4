/**
 * X04 (AUD-C-07, décision du 14/10/2026) — la route d'équipes est l'ENTRÉE UNIQUE des missions planifiées.
 *
 * Constat : chaque mission (appels, quittances, relances, rappels…) avait aussi sa propre route
 * `/api/cron/<mission>`, appelable directement avec le secret, SANS le verrou de mission
 * (`commencer_mission` : une passe à la fois, pause, continuité). Deux passes simultanées d'une mission
 * qui envoie des courriels pouvaient donc se chevaucher. Vercel et pg_cron n'appellent que
 * `/api/cron/equipes?mission=…` : les routes directes n'étaient qu'une porte sans verrou.
 *
 * Décision : retirer l'export direct. Les traitements vivent dans src/lib/missions-planifiees/, hors de
 * toute route ; seule la route d'équipes les appelle, à l'intérieur de `executerMission`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const RACINE = join(__dirname, "..");
const CRON = join(RACINE, "src", "app", "api", "cron");

const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
import { proxy } from "../src/proxy";
import { MISSIONS } from "../src/lib/missions";

/** Chaque fichier route.ts sous src/app/api/cron, en chemin relatif à ce dossier. */
function routes(dossier = CRON, prefixe = ""): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? routes(join(dossier, e.name), `${prefixe}${e.name}/`) : e.name === "route.ts" ? [`${prefixe}route.ts`] : []
  );
}

const vercel = JSON.parse(readFileSync(join(RACINE, "vercel.json"), "utf-8")) as { crons: { path: string }[] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null } }) } });
});

describe("X04 — une seule porte pour les missions", () => {
  it("les seules routes de tâche sont celle d'équipes, celle du suivi des dossiers et celle de l'alerte du relais", () => {
    // D46-B (15/10/2026) : l'alerte e-mail du relais n'est pas une mission (aucune clé dans MISSIONS) ; elle a sa route,
    // hors de l'enveloppe des missions, parce que l'arrêt d'urgence ne doit pas la couper (il en est l'un des sujets).
    expect(routes().sort()).toEqual(["equipes/route.ts", "orchestrateur/route.ts", "relais/route.ts"]);
    expect(Object.keys(MISSIONS)).not.toContain("relais");
  });

  it("aucune route directe ne subsiste pour une mission", () => {
    for (const mission of Object.keys(MISSIONS)) {
      expect(existsSync(join(CRON, mission, "route.ts")), `/api/cron/${mission} existe encore`).toBe(false);
    }
  });

  it("chaque mission a son traitement hors route, que la route d'équipes appelle", () => {
    const equipes = readFileSync(join(CRON, "equipes", "route.ts"), "utf8");
    for (const mission of Object.keys(MISSIONS)) {
      expect(existsSync(join(RACINE, "src", "lib", "missions-planifiees", `${mission}.ts`)), mission).toBe(true);
      expect(equipes, mission).toContain(`@/lib/missions-planifiees/${mission}`);
    }
  });

  it("aucun traitement ne s'exporte sous le nom d'un verbe HTTP, et aucun ne déclare de configuration de route", () => {
    for (const mission of Object.keys(MISSIONS)) {
      const source = readFileSync(join(RACINE, "src", "lib", "missions-planifiees", `${mission}.ts`), "utf8");
      expect(source, mission).not.toMatch(/export\s+(async\s+)?(function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/);
      expect(source, mission).not.toMatch(/export\s+const\s+(dynamic|maxDuration|runtime)\b/);
    }
  });

  // Que la route d'équipes passe CHAQUE traitement par `executerMission` (le verrou) n'est plus vérifié ici sur le texte du
  // fichier (une regex cassait au moindre reformatage et laissait passer un traitement échangé ou retiré) : c'est le
  // comportement du GET qui est testé, mission par mission, dans tests/cron-equipes-route.test.ts.

  it("chaque chemin de vercel.json passe par la route d'équipes, celle du suivi des dossiers ou celle du relais", () => {
    for (const c of vercel.crons) {
      const chemin = new URL(`https://gerimmo.test${c.path}`).pathname;
      expect(["/api/cron/equipes", "/api/cron/orchestrateur", "/api/cron/relais"], c.path).toContain(chemin);
    }
  });

  it("le proxy ne laisse plus passer sans session les anciennes routes directes", async () => {
    for (const mission of Object.keys(MISSIONS)) {
      const r = await proxy(new NextRequest(`https://gerimmo.test/api/cron/${mission}`));
      expect(new URL(r.headers.get("location")!).pathname, mission).toBe("/connexion");
    }
  });

  it("le proxy laisse toujours passer les trois routes qui existent (elles vérifient leur secret)", async () => {
    for (const chemin of ["/api/cron/equipes", "/api/cron/orchestrateur", "/api/cron/relais"]) {
      const r = await proxy(new NextRequest(`https://gerimmo.test${chemin}`));
      expect(r.headers.get("location"), chemin).toBeNull();
      expect(r.headers.get("x-middleware-next"), chemin).toBe("1");
    }
  });
});
