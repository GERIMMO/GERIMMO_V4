/**
 * L'adaptateur Stripe de la grille du 28/09/2026, contre un faux Stripe :
 * lignes de facture, TVA selon le régime déclaré, essai préservé, aperçu et
 * application d'une hausse, baisse à l'échéance, miroir du webhook, événement
 * livré deux fois. La même mécanique tourne contre le vrai Stripe de test
 * dans tests/stripe-bac-a-sable.test.ts.
 */
import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apercuChangement,
  appliquerBaisseAEcheance,
  appliquerHausse,
  creerSessionOffre,
  elementsDeMiseAJour,
  finEssaiPreservee,
  lireDetails,
  metadonneesOffre,
} from "@/lib/stripe-offres";
import { offreAgence, offreFormule, offreParticulier, FORMULES_PARTICULIER } from "@/lib/tarifs";

const transport = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ rpc: transport.rpc }) }));
vi.mock("@/lib/relances-paiement", () => ({ envoyerRelancesDues: async () => ({ envois: 0 }) }));
import { POST } from "@/app/api/stripe/webhook/route";

type Appels = Record<string, unknown[]>;

function fauxStripe(options: { statut?: string; items?: { id: string; product: string }[]; refusCarte?: boolean; taux?: { id: string; percentage: number; inclusive: boolean; metadata: Record<string, string> }[] } = {}) {
  const appels: Appels = {};
  const noter = (nom: string, arg: unknown) => ((appels[nom] ??= []).push(arg));
  const items = (options.items ?? [{ id: "si_formule", product: "gerimmo_formule_bailleur" }]).map((i) => ({
    id: i.id,
    quantity: 1,
    price: { id: `price_${i.id}`, product: i.product, unit_amount: 999, recurring: { interval: "month" } },
  }));
  const souscription = { id: "sub_1", customer: "cus_1", status: options.statut ?? "active", items: { data: items }, metadata: {} };
  const stripe = {
    products: {
      retrieve: vi.fn(async (id: string) => ({ id, active: true })),
      update: vi.fn(),
      create: vi.fn(),
    },
    taxRates: {
      list: vi.fn(() => (async function* () { for (const t of options.taux ?? []) yield t; })()),
      create: vi.fn(async (p: unknown) => { noter("taxRates.create", p); return { id: "txr_nouveau" }; }),
    },
    customers: { update: vi.fn(async (_id: string, p: unknown) => noter("customers.update", p)) },
    checkout: {
      sessions: {
        create: vi.fn(async (p: unknown) => { noter("checkout", p); return { url: "https://checkout.stripe.test/s" }; }),
      },
    },
    subscriptions: {
      retrieve: vi.fn(async () => souscription),
      update: vi.fn(async (_id: string, p: unknown) => {
        noter("subscriptions.update", p);
        if (options.refusCarte) throw Object.assign(new Error("Your card was declined."), { type: "StripeCardError", code: "card_declined" });
        return { ...souscription, metadata: (p as { metadata?: Record<string, string> }).metadata ?? {} };
      }),
    },
    invoices: {
      createPreview: vi.fn(async (p: unknown) => { noter("preview", p); return { amount_due: 512 }; }),
    },
  };
  return { stripe: stripe as unknown as Stripe, appels };
}

const FRANCHISE = { nature: "franchise" } as const;
const TVA20 = { nature: "assujetti", tauxPourcent: 20 } as const;

describe("la page de paiement porte la grille, pas un tarif Stripe", () => {
  it("25 biens en annuel : Patrimoine 299,90 € + 5 × 10 €, sans taux en franchise, mention 293 B", async () => {
    const { stripe, appels } = fauxStripe();
    const r = await creerSessionOffre(stripe, {
      offre: offreParticulier(25, "annuel"),
      regime: FRANCHISE,
      customer: "cus_1",
      orgId: "org_1",
      retourOk: "https://x/ok",
      retourAnnule: "https://x/annule",
    });
    expect(r.ok).toBe(true);
    const p = appels.checkout[0] as { line_items: { price_data: { unit_amount: number; recurring: { interval: string }; tax_behavior: string }; quantity: number; tax_rates?: string[] }[]; subscription_data: { metadata: Record<string, string>; trial_end?: number } };
    expect(p.line_items.map((l) => [l.price_data.unit_amount, l.quantity, l.price_data.recurring.interval, l.price_data.tax_behavior])).toEqual([
      [29990, 1, "year", "inclusive"],
      [1000, 5, "year", "inclusive"],
    ]);
    expect(p.line_items.every((l) => !l.tax_rates)).toBe(true);
    expect(p.subscription_data.metadata).toMatchObject({ gerimmo_grille: "2026-09-28", gerimmo_formule: "patrimoine", gerimmo_unites: "25", gerimmo_montant_cents: "34990" });
    expect(p.subscription_data.trial_end).toBeUndefined();
    expect(appels["customers.update"][0]).toEqual({ invoice_settings: { footer: "TVA non applicable, art. 293 B du CGI." } });
  });

  it("agence assujettie : lignes HT par tranche, TVA 20 % en sus (taux créé une fois)", async () => {
    const { stripe, appels } = fauxStripe();
    await creerSessionOffre(stripe, { offre: offreAgence(100), regime: TVA20, customer: "cus_1", orgId: "org_1", retourOk: "a", retourAnnule: "b" });
    const p = appels.checkout[0] as { line_items: { price_data: { unit_amount: number; tax_behavior: string }; quantity: number; tax_rates?: string[] }[] };
    expect(p.line_items.map((l) => [l.price_data.unit_amount, l.quantity])).toEqual([[3900, 1], [200, 40], [150, 50]]);
    expect(p.line_items.every((l) => l.price_data.tax_behavior === "exclusive" && l.tax_rates?.[0] === "txr_nouveau")).toBe(true);
    expect(appels["taxRates.create"][0]).toMatchObject({ percentage: 20, inclusive: false });
  });

  it("un taux existant est réutilisé, pas recréé", async () => {
    const { stripe, appels } = fauxStripe({ taux: [{ id: "txr_existant", percentage: 20, inclusive: true, metadata: { gerimmo: "tva-20-incluse" } }] });
    await creerSessionOffre(stripe, { offre: offreParticulier(1, "mensuel"), regime: TVA20, customer: "cus_1", orgId: "o", retourOk: "a", retourAnnule: "b" });
    const p = appels.checkout[0] as { line_items: { tax_rates?: string[] }[] };
    expect(p.line_items[0].tax_rates).toEqual(["txr_existant"]);
    expect(appels["taxRates.create"]).toBeUndefined();
  });
});

describe("l'essai : les jours restants sont préservés, aucun débit sans accord", () => {
  const maintenant = Date.UTC(2026, 9, 1, 12);
  it("essai jusqu'au 10/10 inclus : premier prélèvement le 11/10 à 00:00 UTC", () => {
    expect(finEssaiPreservee("2026-10-10", maintenant)).toBe(Date.UTC(2026, 9, 11) / 1000);
  });
  it("essai qui finit dans moins de 48 h : reporté juste au-delà, jamais un débit immédiat", () => {
    const r = finEssaiPreservee("2026-10-01", maintenant)!;
    expect(r).toBeGreaterThan(maintenant / 1000 + 48 * 3600);
    expect(r).toBeLessThan(maintenant / 1000 + 49 * 3600);
  });
  it("essai terminé : rien à reporter", () => {
    expect(finEssaiPreservee("2026-09-20", maintenant)).toBeUndefined();
  });
});

describe("changer de formule", () => {
  it("les éléments gardent l'identifiant d'une ligne conservée, ajoutent, suppriment", () => {
    const existants = [
      { id: "si_a", price: { product: "gerimmo_formule_patrimoine" } },
      { id: "si_b", price: { product: "gerimmo_bien_supplementaire" } },
    ] as unknown as Stripe.SubscriptionItem[];
    const lignes = [
      { produit: "gerimmo_formule_patrimoine", quantite: 1, prix: { currency: "eur" as const, product: "gerimmo_formule_patrimoine", unit_amount: 2999, recurring: { interval: "month" as const }, tax_behavior: "inclusive" as const } },
    ];
    expect(elementsDeMiseAJour(existants, lignes)).toEqual([
      expect.objectContaining({ id: "si_a", quantity: 1 }),
      { id: "si_b", deleted: true },
    ]);
  });

  it("aperçu d'une hausse : prorata calculé par Stripe, date de prorata reprise à la confirmation", async () => {
    const { stripe, appels } = fauxStripe();
    const offre = offreFormule(FORMULES_PARTICULIER[2], 4, "mensuel")!;
    const r = await apercuChangement(stripe, { subscription: "sub_1", offre, regime: FRANCHISE, maintenant: 1_800_000_000 });
    expect(r).toEqual({ ok: true, immediatCents: 512, prorationDate: 1_800_000_000, enEssai: false });
    expect(appels.preview[0]).toMatchObject({ subscription_details: { proration_behavior: "always_invoice", proration_date: 1_800_000_000 } });
    await appliquerHausse(stripe, { subscription: "sub_1", offre, regime: FRANCHISE, orgId: "org_1", prorationDate: 1_800_000_000 });
    expect(appels["subscriptions.update"][0]).toMatchObject({
      proration_behavior: "always_invoice",
      proration_date: 1_800_000_000,
      payment_behavior: "error_if_incomplete",
      metadata: { gerimmo_formule: "investisseur", gerimmo_unites: "10" },
    });
  });

  it("pendant l'essai Stripe : aucun prorata, rien à prélever", async () => {
    const { stripe, appels } = fauxStripe({ statut: "trialing" });
    const offre = offreFormule(FORMULES_PARTICULIER[2], 4, "mensuel")!;
    const r = await apercuChangement(stripe, { subscription: "sub_1", offre, regime: FRANCHISE });
    expect(r).toMatchObject({ ok: true, immediatCents: 0, enEssai: true });
    expect(appels.preview).toBeUndefined();
    await appliquerHausse(stripe, { subscription: "sub_1", offre, regime: FRANCHISE, orgId: "o", prorationDate: 1 });
    expect(appels["subscriptions.update"][0]).toMatchObject({ proration_behavior: "none" });
  });

  it("paiement du prorata refusé : la hausse n'est pas appliquée, l'erreur est rendue", async () => {
    const { stripe } = fauxStripe({ refusCarte: true });
    const r = await appliquerHausse(stripe, { subscription: "sub_1", offre: offreAgence(60), regime: FRANCHISE, orgId: "o", prorationDate: 1 });
    expect(r.ok).toBe(false);
  });

  it("une baisse à l'échéance ne proratise rien", async () => {
    const { stripe, appels } = fauxStripe();
    await appliquerBaisseAEcheance(stripe, { subscription: "sub_1", offre: offreParticulier(1, "mensuel"), regime: FRANCHISE, orgId: "o" });
    expect(appels["subscriptions.update"][0]).toMatchObject({ proration_behavior: "none", metadata: { gerimmo_formule: "solo", gerimmo_unites: "1" } });
  });
});

describe("le miroir du webhook", () => {
  const secret = "whsec_test_offres";
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_offres");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemple.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    transport.rpc.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  function souscription() {
    return {
      id: "sub_w",
      object: "subscription",
      customer: "cus_w",
      status: "active",
      cancel_at_period_end: false,
      metadata: metadonneesOffre("org_w", offreParticulier(25, "annuel")),
      items: {
        data: [
          { id: "si_1", quantity: 1, current_period_start: 1_790_000_000, current_period_end: 1_821_536_000, price: { unit_amount: 29990, recurring: { interval: "year" } } },
          { id: "si_2", quantity: 5, current_period_start: 1_790_000_000, current_period_end: 1_821_536_000, price: { unit_amount: 1000, recurring: { interval: "year" } } },
        ],
      },
    };
  }

  it("lit ce que Stripe facture réellement", () => {
    expect(lireDetails(souscription() as unknown as Stripe.Subscription)).toMatchObject({
      grille: "2026-09-28",
      periodicite: "annuel",
      formule: "patrimoine",
      unites: 25,
      montantPeriodeCents: 34990,
    });
  });

  it("enregistre le détail ; le même événement livré deux fois n'est appliqué qu'une fois", async () => {
    const vus = new Set<string>();
    transport.rpc.mockImplementation(async (nom: string, p: Record<string, unknown>) => {
      if (nom === "abonnement_evenement_a_traiter") {
        const nouveau = !vus.has(p.p_event_id as string);
        vus.add(p.p_event_id as string);
        return { data: nouveau, error: null };
      }
      if (nom === "abonnement_appliquer") return { data: "org_w", error: null };
      return { data: null, error: null };
    });
    const corps = JSON.stringify({ id: "evt_offre", object: "event", type: "customer.subscription.updated", data: { object: souscription() } });
    const signer = () => new Stripe("sk_test_offres").webhooks.generateTestHeaderString({ payload: corps, secret });
    const r1 = await POST(new Request("https://x/api/stripe/webhook", { method: "POST", body: corps, headers: { "stripe-signature": signer() } }));
    expect(r1.status).toBe(200);
    const details = transport.rpc.mock.calls.filter((c) => c[0] === "abonnement_details");
    expect(details).toHaveLength(1);
    expect(details[0][1]).toMatchObject({ p_customer: "cus_w", p_periodicite: "annuel", p_formule: "patrimoine", p_unites: 25, p_montant_periode_cents: 34990 });
    const r2 = await POST(new Request("https://x/api/stripe/webhook", { method: "POST", body: corps, headers: { "stripe-signature": signer() } }));
    expect(await r2.json()).toMatchObject({ deja_traite: "evt_offre" });
    expect(transport.rpc.mock.calls.filter((c) => c[0] === "abonnement_details")).toHaveLength(1);
  });

  it("un échec d'enregistrement rend 500 et efface la trace : Stripe rejouera", async () => {
    transport.rpc.mockImplementation(async (nom: string) => {
      if (nom === "abonnement_evenement_a_traiter") return { data: true, error: null };
      if (nom === "abonnement_appliquer") return { data: "org_w", error: null };
      if (nom === "abonnement_details") return { data: null, error: { message: "indisponible" } };
      return { data: null, error: null };
    });
    const corps = JSON.stringify({ id: "evt_echec", object: "event", type: "customer.subscription.updated", data: { object: souscription() } });
    const signature = new Stripe("sk_test_offres").webhooks.generateTestHeaderString({ payload: corps, secret });
    const r = await POST(new Request("https://x/api/stripe/webhook", { method: "POST", body: corps, headers: { "stripe-signature": signature } }));
    expect(r.status).toBe(500);
    expect(transport.rpc.mock.calls.map((c) => c[0])).toContain("abonnement_evenement_rejouable");
  });
});
