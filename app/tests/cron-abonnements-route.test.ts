/**
 * La tâche de nuit qui aligne la facturation — ses verrous.
 *
 * Elle porte la clé `service_role`, celle qui voit toutes les organisations.
 * Comme la route des quittances, elle doit REFUSER de tourner dès qu'un réglage
 * manque plutôt que de basculer en mode ouvert — et refuser d'obéir à qui ne
 * présente pas le secret.
 *
 * Le 503 sur réglages absents n'est pas de la coquetterie : un 200 la ferait
 * passer pour saine dans le tableau de bord de Vercel, et personne ne verrait
 * que la quantité facturée dérive du parc réel.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/cron/abonnements/route";

const SECRET = "secret-de-recette-suffisamment-long";

function appel(entete?: string): Request {
  return new Request("https://exemple.fr/api/cron/abonnements", {
    headers: entete ? { authorization: entete } : {},
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
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

  it("secret bon mais Stripe non configuré : 503, avec la variable nommée", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_PRIX_BIEN", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const r = await GET(appel(`Bearer ${SECRET}`));
    expect(r.status).toBe(503);
    expect((await r.json()).erreur).toContain("STRIPE_SECRET_KEY");
  });

  it("Stripe configuré mais pas la clé de service : 503", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_recette");
    vi.stubEnv("STRIPE_PRIX_BIEN", "price_recette");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_recette");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const r = await GET(appel(`Bearer ${SECRET}`));
    expect(r.status).toBe(503);
    expect((await r.json()).erreur).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
