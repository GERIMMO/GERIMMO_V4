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
  programmerPeriodicite,
  resilierAEcheance,
} from "@/lib/stripe-offres";
import { offreAgence, offreFormule, offreParticulier, FORMULES_PARTICULIER } from "@/lib/tarifs";

const transport = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ rpc: transport.rpc }) }));
vi.mock("@/lib/relances-paiement", () => ({ envoyerRelancesDues: async () => ({ envois: 0 }) }));
// Le webhook relit la souscription chez Stripe (audit 29/09, point 2) : le
// client Stripe de la route garde sa vraie vérification de signature, mais
// ses lectures viennent de ce registre.
const chezStripe = vi.hoisted(() => ({
  souscriptions: new Map<string, unknown>(),
  piedPose: [] as string[],
}));
vi.mock("@/lib/stripe", async (importer) => {
  const vrai = await importer<typeof import("@/lib/stripe")>();
  return {
    ...vrai,
    clientStripe: (config: Parameters<typeof vrai.clientStripe>[0]) => {
      const reel = vrai.clientStripe(config);
      return {
        webhooks: reel.webhooks,
        subscriptions: {
          retrieve: async (id: string) => {
            const s = chezStripe.souscriptions.get(id);
            if (!s) throw Object.assign(new Error(`No such subscription: '${id}'`), { code: "resource_missing" });
            return s;
          },
        },
        customers: {
          update: async (id: string) => {
            chezStripe.piedPose.push(id);
            return {};
          },
        },
      };
    },
  };
});
import { POST } from "@/app/api/stripe/webhook/route";

type Appels = Record<string, unknown[]>;

function fauxStripe(options: {
  statut?: string;
  items?: { id: string; product: string }[];
  refusCarte?: boolean;
  taux?: { id: string; percentage: number; inclusive: boolean; metadata: Record<string, string> }[];
  souscriptionsExistantes?: { id: string; status: string }[];
  echeancier?: string;
} = {}) {
  const appels: Appels = {};
  const noter = (nom: string, arg: unknown) => ((appels[nom] ??= []).push(arg));
  const items = (options.items ?? [{ id: "si_formule", product: "gerimmo_formule_bailleur" }]).map((i) => ({
    id: i.id,
    quantity: 1,
    price: { id: `price_${i.id}`, product: i.product, unit_amount: 999, recurring: { interval: "month" } },
  }));
  const souscription = {
    id: "sub_1",
    customer: "cus_1",
    status: options.statut ?? "active",
    items: { data: items },
    metadata: { gerimmo_formule: "bailleur", gerimmo_unites: "3" },
    schedule: options.echeancier ?? null,
    trial_end: options.statut === "trialing" ? 1_900_000_000 : null,
  };
  const phase = (debut: number, fin: number) => ({
    start_date: debut,
    end_date: fin,
    items: [{ price: "price_si_formule", quantity: 1, tax_rates: [] }],
  });
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
        list: vi.fn(async () => ({ data: [] })),
        expire: vi.fn(),
        create: vi.fn(async (p: unknown) => { noter("checkout", p); return { url: "https://checkout.stripe.test/s" }; }),
      },
    },
    subscriptionSchedules: {
      // Un échéancier existant a DÉJÀ une phase future : la phase en cours
      // (maintenant = 1_800_000_000) n'est pas la dernière.
      retrieve: vi.fn(async (id: string) => ({
        id,
        status: "active",
        current_phase: { start_date: 1_799_000_000, end_date: 1_801_000_000 },
        phases: [phase(1_799_000_000, 1_801_000_000), phase(1_801_000_000, 1_803_000_000)],
      })),
      create: vi.fn(async () => ({ id: "sub_sched_neuf", status: "active", current_phase: null, phases: [phase(1_799_000_000, 1_801_000_000)] })),
      update: vi.fn(async (id: string, p: unknown) => { noter("schedules.update", p); return { id }; }),
      release: vi.fn(async (id: string) => { noter("schedules.release", id); return { id }; }),
    },
    subscriptions: {
      list: vi.fn(async () => ({ data: options.souscriptionsExistantes ?? [] })),
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

  it("une souscription vivante chez Stripe : pas de seconde page de paiement (audit 29/09, point 1)", async () => {
    const { stripe, appels } = fauxStripe({ souscriptionsExistantes: [{ id: "sub_vieux", status: "canceled" }, { id: "sub_vif", status: "trialing" }] });
    const r = await creerSessionOffre(stripe, { offre: offreParticulier(1, "mensuel"), regime: FRANCHISE, customer: "cus_1", orgId: "o", retourOk: "a", retourAnnule: "b" });
    expect(r.ok).toBe(false);
    expect(appels.checkout).toBeUndefined();
  });

  it("éditeur assujetti : la mention 293 B est RETIRÉE du client (audit 29/09, point 6)", async () => {
    const { stripe, appels } = fauxStripe();
    await creerSessionOffre(stripe, { offre: offreParticulier(1, "mensuel"), regime: TVA20, customer: "cus_1", orgId: "o", retourOk: "a", retourAnnule: "b" });
    expect(appels["customers.update"][0]).toEqual({ invoice_settings: { footer: "" } });
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

  it("une baisse à l'échéance passe par un échéancier : la période en cours et sa capacité restent, sans prorata (audit 29/09, point 11)", async () => {
    const { stripe, appels } = fauxStripe();
    const r = await appliquerBaisseAEcheance(stripe, { subscription: "sub_1", offre: offreParticulier(1, "mensuel"), regime: FRANCHISE, orgId: "o" });
    expect(r).toEqual({ ok: true, echeancier: "sub_sched_neuf" });
    expect(appels["subscriptions.update"]).toBeUndefined(); // rien ne change avant l'échéance
    const maj = appels["schedules.update"][0] as { proration_behavior: string; end_behavior: string; phases: { start_date?: number; end_date?: number; metadata: Record<string, string>; trial_end?: number }[] };
    expect(maj).toMatchObject({ proration_behavior: "none", end_behavior: "release" });
    expect(maj.phases).toHaveLength(2);
    expect(maj.phases[0].metadata).toMatchObject({ gerimmo_formule: "bailleur", gerimmo_unites: "3" });
    expect(maj.phases[1].metadata).toMatchObject({ gerimmo_formule: "solo", gerimmo_unites: "1", gerimmo_choix: "auto" });
    expect(maj.phases[0].trial_end).toBeUndefined();
  });

  it("échéancier existant : la première phase est celle EN COURS, pas la dernière (audit 29/09, point 5)", async () => {
    const { stripe, appels } = fauxStripe({ echeancier: "sub_sched_1" });
    await programmerPeriodicite(stripe, { subscription: "sub_1", offre: offreParticulier(3, "annuel"), regime: FRANCHISE, orgId: "o" });
    const maj = appels["schedules.update"][0] as { phases: { start_date?: number; end_date?: number }[] };
    expect(maj.phases[0]).toMatchObject({ start_date: 1_799_000_000, end_date: 1_801_000_000 });
  });

  it("souscription en essai : la fin d'essai est recopiée dans la phase en cours", async () => {
    const { stripe, appels } = fauxStripe({ statut: "trialing" });
    await programmerPeriodicite(stripe, { subscription: "sub_1", offre: offreParticulier(3, "annuel"), regime: FRANCHISE, orgId: "o" });
    const maj = appels["schedules.update"][0] as { phases: { trial_end?: number }[] };
    expect(maj.phases[0].trial_end).toBe(1_900_000_000);
  });

  it("résilier, ou confirmer une hausse, libère d'abord l'échéancier en place", async () => {
    const r1 = fauxStripe({ echeancier: "sub_sched_1" });
    const res = await resilierAEcheance(r1.stripe, { subscription: "sub_1", resilier: true });
    expect(res).toMatchObject({ ok: true, echeancierLibere: true });
    expect(r1.appels["schedules.release"]).toEqual(["sub_sched_1"]);
    expect(r1.appels["subscriptions.update"][0]).toEqual({ cancel_at_period_end: true });

    const r2 = fauxStripe({ echeancier: "sub_sched_1" });
    const offre = offreFormule(FORMULES_PARTICULIER[2], 4, "mensuel")!;
    const h = await appliquerHausse(r2.stripe, { subscription: "sub_1", offre, regime: FRANCHISE, orgId: "o", prorationDate: 1, choix: "explicite" });
    expect(h).toMatchObject({ ok: true, echeancierLibere: true });
    expect(r2.appels["schedules.release"]).toEqual(["sub_sched_1"]);
    expect(r2.appels["subscriptions.update"][0]).toMatchObject({ metadata: { gerimmo_choix: "explicite" } });
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
    chezStripe.souscriptions.clear();
    chezStripe.piedPose.length = 0;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  /** Le transport Supabase simulé : un client suivi, une souscription enregistrée. */
  function base(suivi: { stripe_subscription_id: string | null; stripe_statut?: string | null } = { stripe_subscription_id: "sub_w" }) {
    const vus = new Set<string>();
    transport.rpc.mockImplementation(async (nom: string, p: Record<string, unknown>) => {
      if (nom === "abonnement_evenement_a_traiter") {
        const nouveau = !vus.has(p.p_event_id as string);
        vus.add(p.p_event_id as string);
        return { data: nouveau, error: null };
      }
      if (nom === "abonnement_par_client") {
        return {
          data: [{ organization_id: "org_w", organisation: "W", public_tarif: "proprietaire_direct", grille: "2026-09-28", destinataire: null, stripe_statut: "active", ...suivi }],
          error: null,
        };
      }
      if (nom === "abonnement_appliquer" || nom === "abonnement_facture_payee") return { data: "org_w", error: null };
      return { data: null, error: null };
    });
  }

  function evenement(id: string, type: string, objet: unknown) {
    const corps = JSON.stringify({ id, object: "event", type, data: { object: objet } });
    const signature = new Stripe("sk_test_offres").webhooks.generateTestHeaderString({ payload: corps, secret });
    return new Request("https://x/api/stripe/webhook", { method: "POST", body: corps, headers: { "stripe-signature": signature } });
  }
  const appelsA = (nom: string) => transport.rpc.mock.calls.filter((c) => c[0] === nom);

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
    base();
    chezStripe.souscriptions.set("sub_w", souscription());
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
    chezStripe.souscriptions.set("sub_w", souscription());
    transport.rpc.mockImplementation(async (nom: string) => {
      if (nom === "abonnement_evenement_a_traiter") return { data: true, error: null };
      if (nom === "abonnement_par_client") return { data: [{ organization_id: "org_w", stripe_subscription_id: "sub_w" }], error: null };
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

  it("l'état appliqué est celui RELU chez Stripe, pas celui de l'événement (audit 29/09, point 2)", async () => {
    base();
    // L'événement (ancien, livré en retard) dit « active » ; Stripe dit « canceled ».
    chezStripe.souscriptions.set("sub_w", { ...souscription(), status: "canceled" });
    const r = await POST(evenement("evt_retard", "customer.subscription.updated", souscription()));
    expect(r.status).toBe(200);
    expect(appelsA("abonnement_appliquer")[0][1]).toMatchObject({ p_subscription: "sub_w", p_statut: "canceled" });
  });

  it("une seconde souscription vivante n'écrase pas celle qui est suivie ; l'incident est journalisé (audit 29/09, point 1)", async () => {
    base({ stripe_subscription_id: "sub_suivie" });
    chezStripe.souscriptions.set("sub_suivie", { ...souscription(), id: "sub_suivie", status: "active" });
    chezStripe.souscriptions.set("sub_w", souscription());
    const journal = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await POST(evenement("evt_double", "customer.subscription.created", souscription()));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ignore: "souscription_non_suivie" });
    expect(appelsA("abonnement_appliquer")).toHaveLength(0);
    expect(appelsA("abonnement_details")).toHaveLength(0);
    expect(journal.mock.calls.some((c) => String(c[0]).includes("[stripe webhook][double-souscription]"))).toBe(true);
    expect(appelsA("abonnement_evenement_solde")[0][1]).toMatchObject({ p_erreur: expect.stringContaining("non suivie") });
  });

  it("la souscription suivie est TERMINÉE : la nouvelle prend sa place (réabonnement)", async () => {
    base({ stripe_subscription_id: "sub_ancienne", stripe_statut: "canceled" });
    chezStripe.souscriptions.set("sub_ancienne", { ...souscription(), id: "sub_ancienne", status: "canceled" });
    chezStripe.souscriptions.set("sub_w", souscription());
    const r = await POST(evenement("evt_reabo", "customer.subscription.created", souscription()));
    expect(r.status).toBe(200);
    expect(appelsA("abonnement_appliquer")[0][1]).toMatchObject({ p_subscription: "sub_w", p_statut: "active" });
    // Naissance d'une souscription : la mention de TVA est posée sur le client.
    expect(chezStripe.piedPose).toEqual(["cus_w"]);
  });

  it("invoice.paid : seule une facture non nulle compte comme premier paiement (audit 29/09, point 7)", async () => {
    base();
    const facture = (montant: number) => ({
      id: `in_${montant}`,
      object: "invoice",
      customer: "cus_w",
      amount_paid: montant,
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_w" } },
    });
    expect((await POST(evenement("evt_f0", "invoice.paid", facture(0)))).status).toBe(200);
    expect(appelsA("abonnement_facture_payee")).toHaveLength(0);
    expect((await POST(evenement("evt_f1", "invoice.paid", facture(999)))).status).toBe(200);
    expect(appelsA("abonnement_facture_payee")[0][1]).toEqual({ p_customer: "cus_w", p_subscription: "sub_w" });
  });
});
