/**
 * La porte d'entrée des événements Stripe — ses verrous.
 *
 * CETTE ADRESSE EST PUBLIQUE, et elle doit l'être : Stripe l'appelle depuis ses
 * serveurs sans se connecter. La signature est donc la SEULE chose qui
 * distingue Stripe de n'importe qui. Sans elle, le premier venu y poste
 * « abonnement actif » et s'ouvre le produit gratuitement.
 *
 * Ce qu'on vérifie ici n'est pas qu'elle traite : c'est qu'elle REFUSE — sans
 * réglages, sans signature, avec une mauvaise signature — et qu'elle rend le
 * bon code, parce que le code décide si Stripe rejoue ou non.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../src/app/api/stripe/webhook/route";

function appel(corps: string, signature?: string): Request {
  return new Request("https://exemple.fr/api/stripe/webhook", {
    method: "POST",
    headers: signature ? { "stripe-signature": signature } : {},
    body: corps,
  });
}

function reglagesComplets() {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_recette");
  vi.stubEnv("STRIPE_PRIX_BIEN", "price_recette");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_recette");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemple.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-de-recette");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("la route refuse plutôt que de s'ouvrir", () => {
  it("sans les clés Stripe, elle répond 503 — pas 200", async () => {
    // 200 dirait à Stripe « c'est réglé ». Si quelqu'un a branché le webhook
    // sans poser les clés, il doit le voir dans son tableau de bord, pas le
    // découvrir au premier client qui paie sans que son compte s'ouvre.
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_PRIX_BIEN", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const r = await POST(appel("{}", "t=1,v1=x"));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({
      erreur: expect.stringContaining("STRIPE_SECRET_KEY"),
    });
  });

  it("sans clé de service, elle répond 503 : elle ne pourrait rien enregistrer", async () => {
    reglagesComplets();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const r = await POST(appel("{}", "t=1,v1=x"));
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({
      erreur: expect.stringContaining("SUPABASE_SERVICE_ROLE_KEY"),
    });
  });

  it("sans en-tête de signature : 400, et rien n'est lu", async () => {
    reglagesComplets();
    const r = await POST(appel(JSON.stringify({ type: "customer.subscription.updated" })));
    expect(r.status).toBe(400);
  });

  it("avec une signature inventée : 400, et Stripe ne rejoue pas", async () => {
    // 400 et non 500 : une signature invalide ne deviendra pas valide. La
    // rejouer pendant trois jours ne ferait qu'encombrer le tableau de bord.
    reglagesComplets();
    const r = await POST(
      appel(JSON.stringify({ id: "evt_x", type: "customer.subscription.updated" }), "t=1,v1=faux")
    );
    expect(r.status).toBe(400);
    const corps = await r.json();
    // Le message reste muet sur ce qui cloche : celui qui teste sa signature
    // n'a pas à être aidé.
    expect(corps.erreur).toBe("Signature refusée.");
  });

  it("un corps vide avec une signature vide reste refusé", async () => {
    reglagesComplets();
    const r = await POST(appel("", ""));
    expect(r.status).toBe(400);
  });

  it("en GET, elle explique au lieu de rendre un 405 nu", async () => {
    const r = GET();
    expect(r.status).toBe(405);
    expect((await r.json()).message).toContain("POST");
  });
});
