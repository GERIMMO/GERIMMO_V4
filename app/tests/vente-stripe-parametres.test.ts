/**
 * Plan de conformité du 23/10/2026, contre un faux Stripe :
 *  · R21 : la page de paiement dit « Payer » (`submit_type: "pay"`), en français, avec sous le bouton l'obligation de
 *    paiement, le montant et, avec un essai, la date du premier prélèvement. La recette réelle du bouton (clés de test,
 *    avec et sans essai) reste à faire dans le chantier Stripe ;
 *  · R04 : le portail client ne résilie plus (`subscription_cancel` désactivée) ; nouvelle marque de configuration.
 */
import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import { MARQUE_PORTAIL, assurerConfigurationPortail } from "@/lib/stripe";
import { creerSessionOffre, messageBoutonPaiement } from "@/lib/stripe-offres";
import { euros, offreParticulier } from "@/lib/tarifs";

function fauxStripe() {
  const stripe = {
    products: { retrieve: vi.fn(async (id: string) => ({ id, active: true })) },
    taxRates: { list: () => (async function* () {})() },
    customers: { update: vi.fn(async () => ({})) },
    subscriptions: { list: vi.fn(async () => ({ data: [] })) },
    checkout: {
      sessions: {
        list: vi.fn(async () => ({ data: [] })),
        create: vi.fn(async (_p: Record<string, unknown>, _o?: unknown) => ({ id: "cs_test_1", url: "https://checkout.stripe.test/c/pay/cs_test_1" })),
      },
    },
    billingPortal: {
      configurations: {
        list: () => (async function* () {})(),
        create: vi.fn(async (_p: Record<string, unknown>) => ({ id: "bpc_neuf" })),
        update: vi.fn(),
      },
    },
  };
  return stripe as typeof stripe & Stripe;
}

const intention = { id: "00000000-0000-4000-8000-000000000001", creeLeMs: Date.parse("2026-10-24T10:00:00Z"), expireLeS: Date.parse("2026-10-24T10:45:00Z") / 1000 };

describe("R21 — le dernier bouton de la page de paiement", () => {
  it("sans essai : « Payer », en français, obligation de paiement et montant", async () => {
    const stripe = fauxStripe();
    const offre = offreParticulier(1, "mensuel");
    const r = await creerSessionOffre(stripe, {
      offre, regime: { nature: "franchise" }, customer: "cus_1", orgId: "org-1",
      retourOk: "https://www.gerimmo.test/ok", retourAnnule: "https://www.gerimmo.test/annule", intention,
    });
    expect(r.ok).toBe(true);
    const [params] = stripe.checkout.sessions.create.mock.calls[0];
    expect(params).toMatchObject({
      mode: "subscription",
      submit_type: "pay",
      locale: "fr",
      custom_text: { submit: { message: `En cliquant, vous commandez l'abonnement Gerimmo Solo avec obligation de paiement : ${euros(599)} par mois.` } },
    });
  });

  it("avec un essai : la date du premier prélèvement suit le montant", async () => {
    const stripe = fauxStripe();
    const offre = offreParticulier(3, "annuel");
    await creerSessionOffre(stripe, {
      offre, regime: { nature: "franchise" }, customer: "cus_1", orgId: "org-1", essaiFin: "2026-12-24",
      retourOk: "https://www.gerimmo.test/ok", retourAnnule: "https://www.gerimmo.test/annule", intention,
    });
    const [params] = stripe.checkout.sessions.create.mock.calls[0] as unknown as [{ custom_text: { submit: { message: string } }; subscription_data: { trial_end: number } }];
    expect(params.subscription_data.trial_end).toBeGreaterThan(0);
    expect(params.custom_text.submit.message).toBe(
      `En cliquant, vous commandez l'abonnement Gerimmo Bailleur avec obligation de paiement : ${messageBoutonPaiement(offre, null).match(/: (.*)\.$/)?.[1]}, premier prélèvement le 25 décembre 2026.`
    );
    expect(params.custom_text.submit.message.length).toBeLessThanOrEqual(1200);
  });
});

describe("R04 — le portail client ne résilie plus", () => {
  it("la configuration créée désactive la résiliation, sous la nouvelle marque", async () => {
    expect(MARQUE_PORTAIL).toBe("portail-2026-10-24");
    const stripe = fauxStripe();
    expect(await assurerConfigurationPortail(stripe, "https://www.gerimmo.test")).toBe("bpc_neuf");
    const [params] = stripe.billingPortal.configurations.create.mock.calls[0] as unknown as [{ features: Record<string, { enabled: boolean }>; metadata: Record<string, string> }];
    expect(params.features.subscription_cancel).toEqual({ enabled: false });
    expect(params.features.subscription_update.enabled).toBe(false);
    expect(params.features.payment_method_update.enabled).toBe(true);
    expect(params.features.invoice_history.enabled).toBe(true);
    expect(params.metadata).toEqual({ gerimmo: "portail-2026-10-24" });
  });
});
