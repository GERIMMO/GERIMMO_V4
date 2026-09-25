/**
 * La tâche de nuit qui aligne la facturation — ses verrous.
 *
 * Elle porte la clé `service_role`, celle qui voit toutes les organisations.
 * Comme la route des quittances, elle doit REFUSER de tourner dès qu'un réglage
 * manque plutôt que de basculer en mode ouvert — et refuser d'obéir à qui ne
 * présente pas le secret.
 *
 * Sans secret ni clé de service, 503 : elle ne peut rien consigner. Sans
 * Stripe, elle consigne d'abord (25/09) — c'est Santé qui dit la connexion
 * manquante, pas une tâche « jamais exécutée ».
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ consigner: vi.fn() }));
vi.mock("@/lib/tache", async (importer) => ({
  ...(await importer<typeof import("@/lib/tache")>()),
  consignerTache: mocks.consigner,
}));
import { GET } from "../src/app/api/cron/abonnements/route";

const SECRET = "secret-de-recette-suffisamment-long";

function appel(entete?: string): Request {
  return new Request("https://exemple.fr/api/cron/abonnements", {
    headers: entete ? { authorization: entete } : {},
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("la tâche refuse plutôt que de s'ouvrir", () => {
  it("sans CRON_SECRET, elle ne tourne pas du tout", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const r = await GET(appel(`Bearer ${SECRET}`));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ erreur: expect.stringContaining("CRON_SECRET") });
  });

  it("sans en-tête, ou avec le mauvais secret : 401", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await GET(appel())).status).toBe(401);
    expect((await GET(appel("Bearer autre-chose"))).status).toBe(401);
    // Un secret plus court n'est pas « presque bon » : la comparaison à temps
    // constant refuse d'abord sur la longueur, sans la révéler.
    expect((await GET(appel(`Bearer ${SECRET.slice(0, -1)}`))).status).toBe(401);
  });

  it("secret bon mais sans clé de service : 503, avec la variable nommée", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const r = await GET(appel(`Bearer ${SECRET}`));
    expect(r.status).toBe(503);
    expect((await r.json()).erreur).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(mocks.consigner).not.toHaveBeenCalled();
  });

  // Consigner AVANT de s'arrêter (25/09) : le 503 sans journal laissait la
  // tâche « aucune exécution » à vie dans Santé et « À vérifier » chaque nuit
  // dans Équipes. La connexion manquante est dite par la ligne de
  // configuration ; la passe dit seulement qu'elle n'a rien pu faire.
  it("Stripe non configuré : la passe est consignée « non configurée » et répond 200", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_PRIX_BIEN", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://recette.supabase.co");
    const r = await GET(appel(`Bearer ${SECRET}`));
    expect(r.status).toBe(200);
    const corps = await r.json();
    expect(corps).toMatchObject({ non_configuree: true, ignores: 0 });
    expect(corps.motif).toContain("STRIPE_SECRET_KEY");
    expect(mocks.consigner).toHaveBeenCalledWith(expect.anything(), "abonnements", expect.objectContaining({ non_configuree: true, motif: "stripe_absent" }));
  });
});
