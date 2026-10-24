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

function fauxStripe(configurations: Record<string, unknown>[] = []) {
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
        list: () =>
          (async function* () {
            for (const c of configurations) yield c;
          })(),
        create: vi.fn(async (_p: Record<string, unknown>) => ({ id: "bpc_neuf" })),
        update: vi.fn(async (id: string, _p: Record<string, unknown>) => ({ id })),
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

describe("relecture adverse du 24/10 (M11, agences hors V1) : le montant agence dit « HT » quand la TVA s'ajoute", () => {
  it("régime TVA : « HT, TVA en sus » ; franchise : le montant seul", async () => {
    const { offreAgence } = await import("@/lib/tarifs");
    const offre = offreAgence(12);
    expect(messageBoutonPaiement(offre, null, { nature: "assujetti", tauxPourcent: 20 })).toContain(`${euros(offre.montantCents)} HT, TVA en sus, par mois`);
    expect(messageBoutonPaiement(offre, null, { nature: "franchise" })).toContain(`${euros(offre.montantCents)} par mois`);
    expect(messageBoutonPaiement(offreParticulier(1, "mensuel"), null, { nature: "assujetti", tauxPourcent: 20 })).not.toContain("HT");
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

  it("relecture adverse du 24/10 (point 9) : les anciennes configurations Gerimmo (résiliation ouverte) sont désactivées", async () => {
    const profil = { privacy_policy_url: "https://www.gerimmo.test/confidentialite", terms_of_service_url: "https://www.gerimmo.test/conditions" };
    const stripe = fauxStripe([
      { id: "bpc_ancienne", active: true, is_default: false, metadata: { gerimmo: "portail-2026-09-28" }, business_profile: profil },
      { id: "bpc_tableau_de_bord", active: true, is_default: true, metadata: {}, business_profile: profil },
      { id: "bpc_actuelle", active: true, is_default: false, metadata: { gerimmo: MARQUE_PORTAIL }, business_profile: profil },
    ]);
    expect(await assurerConfigurationPortail(stripe, "https://www.gerimmo.test")).toBe("bpc_actuelle");
    expect(stripe.billingPortal.configurations.update).toHaveBeenCalledWith("bpc_ancienne", { active: false });
    expect(stripe.billingPortal.configurations.update).toHaveBeenCalledTimes(1); // ni la configuration par défaut, ni l'actuelle
    expect(stripe.billingPortal.configurations.create).not.toHaveBeenCalled();
  });

  it("point 9 : une ancienne configuration Gerimmo devenue celle par défaut n'est pas désactivable (Stripe le refuse) : elle reste, le reste suit", async () => {
    const stripe = fauxStripe([{ id: "bpc_ancienne_defaut", active: true, is_default: true, metadata: { gerimmo: "portail-2026-09-28" } }]);
    expect(await assurerConfigurationPortail(stripe, "https://www.gerimmo.test")).toBe("bpc_neuf");
    expect(stripe.billingPortal.configurations.update).not.toHaveBeenCalled();
  });
});
