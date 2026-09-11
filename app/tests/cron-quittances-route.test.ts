/**
 * La route d'envoi des quittances — ses verrous (11/09).
 *
 * Cette route est la seule du produit à porter la clé `service_role`, celle qui
 * contourne la RLS et voit toutes les organisations. Ce qu'on vérifie ici n'est
 * pas qu'elle envoie : c'est qu'elle REFUSE de tourner dès qu'un de ses trois
 * réglages manque, au lieu de basculer en mode ouvert — et qu'elle ne se laisse
 * pas appeler sans le secret.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/cron/quittances/route";
import { proxy } from "../src/proxy";

const SECRET = "secret-de-recette-suffisamment-long";

function appel(entete?: string): Request {
  return new Request("https://exemple.fr/api/cron/quittances", {
    headers: entete ? { authorization: entete } : {},
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("la route refuse plutôt que de s'ouvrir", () => {
  it("sans CRON_SECRET, elle ne tourne pas du tout", async () => {
    // Une route qui expédie du courrier à qui l'appelle serait pire que pas
    // d'envoi du tout : l'absence de secret désactive la tâche, elle ne la
    // laisse pas ouverte.
    vi.stubEnv("CRON_SECRET", "");
    const r = await GET(appel(`Bearer ${SECRET}`));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ erreur: expect.stringContaining("CRON_SECRET") });
  });

  it("sans en-tête, ou avec le mauvais secret : 401", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    expect((await GET(appel())).status).toBe(401);
    expect((await GET(appel("Bearer faux"))).status).toBe(401);
    // Un secret de la bonne longueur mais faux ne passe pas davantage.
    expect((await GET(appel(`Bearer ${"x".repeat(SECRET.length)}`))).status).toBe(401);
    // Ni le secret nu, sans le schéma.
    expect((await GET(appel(SECRET))).status).toBe(401);
  });

  it("avec le bon secret mais sans clé de service, elle s'arrête aussi", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const r = await GET(appel(`Bearer ${SECRET}`));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({
      erreur: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"),
    });
  });

  it("sans adresse de site, elle n'envoie pas de lien mort", async () => {
    // Le message porte « Consulter / imprimer le document » : sans adresse, le
    // lien pointerait dans le vide, et la quittance serait inconsultable.
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemple.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "cle-de-service-factice");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    const r = await GET(appel(`Bearer ${SECRET}`));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({
      erreur: expect.stringContaining("NEXT_PUBLIC_SITE_URL"),
    });
  });
});

describe("le contrôle d'authentification laisse passer les tâches", () => {
  it("/api/cron/* ne part pas vers /connexion", async () => {
    // Une tâche planifiée n'a pas de session : sans cette exception, le proxy
    // la redirigerait vers la page de connexion et rien ne partirait jamais.
    const r = await proxy(new NextRequest("https://exemple.fr/api/cron/quittances"));
    expect(r.status).toBe(200);
    expect(r.headers.get("location")).toBeNull();
  });
});
