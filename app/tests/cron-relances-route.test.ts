/**
 * La route des relances d'impayé — ses verrous (20/09).
 *
 * Comme les quatre autres routes de tâches, elle porte la clé `service_role`.
 * Ce qu'on vérifie ici n'est pas qu'elle envoie : c'est qu'elle REFUSE de
 * tourner dès qu'un réglage manque, au lieu de basculer en mode ouvert — et
 * qu'elle ne se laisse pas appeler sans le secret.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/cron/relances/route";

const SECRET = "secret-de-recette-suffisamment-long";

function appel(entete?: string): Request {
  return new Request("https://exemple.fr/api/cron/relances", {
    headers: entete ? { authorization: entete } : {},
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("la route des relances refuse plutôt que de s'ouvrir", () => {
  it("sans CRON_SECRET, elle ne tourne pas du tout", async () => {
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

  it("avec le secret mais sans clé de service : 503, pas de lecture", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const r = await GET(appel(`Bearer ${SECRET}`));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ erreur: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY") });
  });
});
