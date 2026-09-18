/**
 * La route d'envoi des avis d'échéance — ses verrous, et ce qu'elle écrit (18/09).
 *
 * Comme celle des quittances, cette route porte la clé `service_role`, celle
 * qui contourne la RLS et voit toutes les organisations. On vérifie ici qu'elle
 * REFUSE de tourner dès qu'un de ses trois réglages manque, au lieu de basculer
 * en mode ouvert — et que le message composé dit ce qu'il doit dire.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/cron/appels/route";
import { corpsAvisEcheance, sujetAvisEcheance, jourDeLEcheance } from "../src/lib/appel-email";
import { proxy } from "../src/proxy";
import { eur } from "../src/lib/ged";

const SECRET = "secret-de-recette-suffisamment-long";

function appel(entete?: string): Request {
  return new Request("https://exemple.fr/api/cron/appels", {
    headers: entete ? { authorization: entete } : {},
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("la route refuse plutôt que de s'ouvrir", () => {
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
  it("/api/cron/appels ne part pas vers /connexion", async () => {
    const r = await proxy(new NextRequest("https://exemple.fr/api/cron/appels"));
    expect(r.status).toBe(200);
    expect(r.headers.get("location")).toBeNull();
  });
});

describe("le message dit ce qu'il doit dire", () => {
  const base = {
    periode: "2026-10-01",
    loyerHc: 700,
    charges: 50,
    resteDu: 750,
    dateEcheance: "2026-10-04",
    prorata: false,
    arriere: 0,
    emetteur: "Agence Test",
    prenom: "Julie",
    lien: "https://exemple.fr/locataire/org/loyers",
  };

  it("s'annonce comme un avis d'échéance, jamais comme une quittance", async () => {
    // Les trois mots ne sont pas interchangeables : la quittance libère, le
    // reçu constate, l'avis annonce.
    expect(sujetAvisEcheance(base)).toBe("Avis d'échéance — octobre 2026");
    const html = corpsAvisEcheance(base);
    expect(html).toContain("Avis d'échéance —");
    expect(html).not.toMatch(/quittance de loyer/i);
  });

  it("porte la date d'échéance en toutes lettres", () => {
    expect(jourDeLEcheance("2026-10-04")).toBe("4 octobre 2026");
    expect(corpsAvisEcheance(base)).toContain("4 octobre 2026");
  });

  it("sépare le loyer des charges", () => {
    const html = corpsAvisEcheance(base);
    expect(html).toContain("Loyer hors charges");
    expect(html).toContain("Provision pour charges");
  });

  it("explique le prorata au lieu de laisser un montant inexpliqué", () => {
    expect(corpsAvisEcheance({ ...base, prorata: true })).toMatch(/au prorata/i);
    expect(corpsAvisEcheance(base)).not.toMatch(/au prorata/i);
  });

  it("dit le solde antérieur et le total, quand il y en a un", () => {
    const html = corpsAvisEcheance({ ...base, arriere: 750 });
    expect(html).toMatch(/Solde antérieur/i);
    // 750 dus + 750 d'arriéré : le total évite au locataire de faire l'addition.
    expect(html).toContain(eur(1500));
  });

  it("ne parle pas de solde antérieur quand le locataire est à jour", () => {
    expect(corpsAvisEcheance(base)).not.toMatch(/Solde antérieur/i);
  });

  it("prévoit le paiement qui s'est croisé avec l'avis", () => {
    // L'appel est annoncé le jour de sa création : un virement parti la veille
    // n'est pas encore saisi. Le dire évite l'appel téléphonique inquiet.
    expect(corpsAvisEcheance(base)).toMatch(/croisé/i);
  });
});
