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
import { MESSAGE_RECEPTION_STRIPE_INDISPONIBLE } from "../src/lib/stripe";

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
  vi.restoreAllMocks();
});

describe("la route refuse plutôt que de s'ouvrir", () => {
  // TEC-3 (19/11/2026) : l'adresse est publique. La réponse ne nomme aucune variable d'environnement ; le motif exact
  // (celui de `configurationStripe()`, écrit pour le super admin) va au journal du serveur.
  it.each([
    ["les deux clés Stripe", { STRIPE_SECRET_KEY: "", STRIPE_WEBHOOK_SECRET: "" }, ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]],
    ["le secret du webhook", { STRIPE_WEBHOOK_SECRET: "" }, ["STRIPE_WEBHOOK_SECRET"]],
  ])("sans %s, elle répond 503 — pas 200 — sans nommer la variable", async (_cas, absentes, nommees) => {
    // 200 dirait à Stripe « c'est réglé ». Si quelqu'un a branché le webhook
    // sans poser les clés, il doit le voir dans son tableau de bord, pas le
    // découvrir au premier client qui paie sans que son compte s'ouvre.
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    reglagesComplets();
    for (const [nom, valeur] of Object.entries(absentes)) vi.stubEnv(nom, valeur);
    const r = await POST(appel("{}", "t=1,v1=x"));
    expect(r.status).toBe(503);
    const corps = await r.json();
    expect(corps).toEqual({ erreur: MESSAGE_RECEPTION_STRIPE_INDISPONIBLE });
    expect(JSON.stringify(corps)).not.toMatch(/STRIPE_|SUPABASE|absente|configur/i);
    for (const nom of nommees) expect(JSON.stringify(journal.mock.calls)).toContain(nom);
  });

  it("sans clé de service, elle répond 503 : elle ne pourrait rien enregistrer — sans nommer la variable", async () => {
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    reglagesComplets();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const r = await POST(appel("{}", "t=1,v1=x"));
    expect(r.status).toBe(503);
    const corps = await r.json();
    expect(corps).toEqual({ erreur: MESSAGE_RECEPTION_STRIPE_INDISPONIBLE });
    expect(JSON.stringify(corps)).not.toMatch(/SUPABASE|SERVICE_ROLE|absente/i);
    expect(JSON.stringify(journal.mock.calls)).toContain("SUPABASE_SERVICE_ROLE_KEY");
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
    // Et aucun en-tête ne le trahit non plus (audit 25/09, S7) : le motif
    // exact va au journal serveur, pas à l'appelant.
    expect(r.headers.get("x-motif")).toBeNull();
    for (const [nom, valeur] of r.headers) {
      expect(`${nom}: ${valeur}`.toLowerCase()).not.toMatch(/timestamp|signature|secret|whsec/);
    }
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
