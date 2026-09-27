import { afterEach, describe, expect, it, vi } from "vitest";
import { configurationStripeV2, finEssaiV2, lignesTarifV2, ouvrirSouscriptionV2, terminerSouscriptionEssaiV2,
  augmenterAbonnementV2, programmerBaisseV2, resilierAbonnementV2, empreinteSouscription, type ConfigurationV2, type PropositionStripeV2 } from "@/lib/stripe-tarification";
import type Stripe from "stripe";
const config: ConfigurationV2 = { cle: "sk_test_x", reel: false, catalogue: { solo_mensuel: "price_solo", agence_mensuel: "price_agence", patrimoine_annuel: "price_pa", supplement_annuel: "price_sup" }, fiscalite: { mode: "exonere", mention: "Exonération de test explicitement choisie" } };
const proposition: PropositionStripeV2 = { version: "2026-09-v2", public_tarif: "proprietaire_direct", volume_source: 1, volume_cible: 1, capacite: 1, formule: "solo", periodicite: "mensuel", montant_centimes: 599, total_centimes: 599, taxe_centimes: 0, prorata_centimes: 0, date_effet: "2026-10-01T00:00:00Z", type: "souscription", revision_abonnement: "nouveau", stripe_customer_id: "cus_x", stripe_subscription_id: null, stripe_lignes: [{ price: "price_solo", quantity: 1 }], stripe_proration_date: 0, fiscalite: { mode: "exonere", mention: "Exonération test" }, essai_fin: "2026-10-01T00:00:00Z", empreinte_stripe: null, acteur_id: "acteur" };
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("tarification Stripe isolée", () => {
  it("refuse une clé réelle sans décision d’activation distincte", () => { vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_x"); vi.stubEnv("GERIMMO_TARIFICATION_V2_PRODUCTION", ""); expect(() => configurationStripeV2()).toThrow("réel"); });
  it("refuse une fiscalité non renseignée", () => { vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x"); vi.stubEnv("STRIPE_FISCALITE_V2_JSON", "{}"); expect(() => configurationStripeV2()).toThrow("régime fiscal"); });
  it("préserve exactement les dernières heures et minutes de l’essai", () => { const now = Date.UTC(2026, 8, 28, 10); expect(finEssaiV2(new Date(now + 60_000).toISOString(), now)).toBe(now / 1000 + 60); expect(finEssaiV2(new Date(now).toISOString(), now)).toBeUndefined(); });
  it("porte le socle agence même avec zéro lot, sans supplément particulier", async () => {
    const retrieve = vi.fn().mockResolvedValue({ id: "price_agence", active: true, livemode: false, currency: "eur", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, tax_behavior: "exclusive", billing_scheme: "tiered", tiers_mode: "graduated", tiers: [{ up_to: 10, unit_amount: 0, flat_amount: 3900 }, { up_to: 50, unit_amount: 200 }, { up_to: 200, unit_amount: 150 }, { up_to: null, unit_amount: 100 }] });
    const stripe = { prices: { retrieve } } as unknown as Stripe;
    expect((await lignesTarifV2(stripe, config, "agence", 0, "mensuel")).lignes).toEqual([{ price: "price_agence", quantity: 1 }]);
    expect((await lignesTarifV2(stripe, config, "agence", 300, "mensuel")).lignes).toEqual([{ price: "price_agence", quantity: 300 }]);
    expect(retrieve).toHaveBeenCalledTimes(2);
  });
  it.each(["volume", "incorrect"]) ("refuse un barème agence divergent : %s", async mode => {
    const stripe = { prices: { retrieve: vi.fn().mockResolvedValue({ id: "price_agence", active: true, livemode: false, currency: "eur", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, tax_behavior: "exclusive", billing_scheme: "tiered", tiers_mode: mode, tiers: [] }) } } as unknown as Stripe;
    await expect(lignesTarifV2(stripe, config, "agence", 100, "mensuel")).rejects.toThrow("tranches");
  });
  it("refuse un prix test/réel mélangé ou un montant différent", async () => {
    const prix = { id: "price_solo", active: true, livemode: true, currency: "eur", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, tax_behavior: "inclusive", billing_scheme: "per_unit", unit_amount: 599 };
    const retrieve = vi.fn().mockResolvedValue(prix); const stripe = { prices: { retrieve } } as unknown as Stripe;
    await expect(lignesTarifV2(stripe, config, "proprietaire_direct", 1, "mensuel")).rejects.toThrow("correspond");
    retrieve.mockResolvedValue({ ...prix, livemode: false, unit_amount: 600 });
    await expect(lignesTarifV2(stripe, config, "proprietaire_direct", 1, "mensuel")).rejects.toThrow("montant");
  });
  it("annuel 25 biens : formule 29990 + cinq suppléments de 1000", async () => {
    const stripe = { prices: { retrieve: vi.fn(async (id: string) => ({ id, active: true, livemode: false, currency: "eur", recurring: { interval: "year", interval_count: 1, usage_type: "licensed" }, tax_behavior: "inclusive", billing_scheme: "per_unit", unit_amount: id === "price_pa" ? 29990 : 1000 })) } } as unknown as Stripe;
    const r = await lignesTarifV2(stripe, config, "proprietaire_direct", 25, "annuel"); expect(r.tarif.montantCentimes).toBe(34990); expect(r.lignes).toEqual([{ price: "price_pa", quantity: 1 }, { price: "price_sup", quantity: 5 }]);
  });
  it("Checkout enregistre la carte sans prélèvement s’il reste une heure", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T23:00:00Z"));
    const create = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/test" });
    await ouvrirSouscriptionV2({ checkout: { sessions: { create } } } as unknown as Stripe, proposition, "org", "prop", "https://gerimmo.test/abonnement");
    expect(create.mock.calls[0][0]).toMatchObject({ mode: "setup", currency: "eur" }); expect(create.mock.calls[0][0].line_items).toBeUndefined();
    expect(create.mock.calls[0][1]).toEqual({ idempotencyKey: "abonnement-v2-checkout-prop" });
  });
  it("un essai expiré depuis la proposition demande une nouvelle confirmation", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-02T00:00:00Z")); const create = vi.fn();
    await expect(ouvrirSouscriptionV2({ checkout: { sessions: { create } } } as unknown as Stripe, proposition, "org", "prop", "https://test")).rejects.toThrow("Confirmez"); expect(create).not.toHaveBeenCalled();
  });
  it("le webhook setup conserve la date exacte et porte son idempotence", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T23:00:00Z"));
    const create = vi.fn().mockResolvedValue({ status: "trialing" });
    const stripe = { setupIntents: { retrieve: vi.fn().mockResolvedValue({ status: "succeeded", customer: "cus_x", payment_method: "pm_x" }) }, subscriptions: { create } } as unknown as Stripe;
    await terminerSouscriptionEssaiV2(stripe, { mode: "setup", status: "complete", customer: "cus_x", setup_intent: "seti_x", metadata: { proposition_id: "prop" } } as unknown as Stripe.Checkout.Session, proposition, "org", "prop");
    expect(create.mock.calls[0][0].trial_end).toBe(Date.parse(proposition.essai_fin!) / 1000); expect(create.mock.calls[0][1].idempotencyKey).toBe("abonnement-v2-essai-prop");
  });
  it("une carte non confirmée ne crée aucune souscription", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-30T23:00:00Z")); const create = vi.fn();
    const stripe = { setupIntents: { retrieve: vi.fn().mockResolvedValue({ status: "requires_action", customer: "cus_x", payment_method: "pm_x" }) }, subscriptions: { create } } as unknown as Stripe;
    await expect(terminerSouscriptionEssaiV2(stripe, { mode: "setup", status: "complete", customer: "cus_x", setup_intent: "seti_x", metadata: { proposition_id: "prop" } } as unknown as Stripe.Checkout.Session, proposition, "org", "prop")).rejects.toThrow("confirmé"); expect(create).not.toHaveBeenCalled();
  });
  it("une hausse emploie le prorata présenté et attend le paiement", async () => {
    const update = vi.fn().mockResolvedValue({ pending_update: {} });
    const s = { id: "sub_x", items: { data: [{ id: "si_x", price: { id: "price_old", recurring: { interval: "month" } }, quantity: 1 }] } } as unknown as Stripe.Subscription;
    await augmenterAbonnementV2({ subscriptions: { update } } as unknown as Stripe, s, { ...proposition, stripe_proration_date: 1234 }, "org", "prop");
    expect(update.mock.calls[0][1]).toMatchObject({ payment_behavior: "pending_if_incomplete", proration_behavior: "always_invoice", proration_date: 1234 });
  });
  it("interdit de remplacer silencieusement un calendrier existant", async () => {
    const create = vi.fn(); await expect(programmerBaisseV2({ subscriptionSchedules: { create } } as unknown as Stripe, { schedule: "sched" } as Stripe.Subscription, proposition, "org", "prop")).rejects.toThrow("déjà"); expect(create).not.toHaveBeenCalled();
  });
  it("l’empreinte distingue résiliation et changements de quantité", () => {
    const s = { id: "s", status: "active", cancel_at_period_end: false, items: { data: [{ id: "si", price: { id: "p" }, quantity: 1, current_period_end: 4000 }] } } as unknown as Stripe.Subscription;
    expect(empreinteSouscription(s)).not.toBe(empreinteSouscription({ ...s, cancel_at_period_end: true }));
  });
  it("résilier annule le futur changement sans annuler la période payée", async () => {
    const release = vi.fn().mockResolvedValue({}); const update = vi.fn().mockResolvedValue({});
    const stripe = { subscriptionSchedules: { retrieve: vi.fn().mockResolvedValue({ metadata: { proposition_id: "ancienne" } }), release }, subscriptions: { update } } as unknown as Stripe;
    await resilierAbonnementV2(stripe, { id: "sub", schedule: "sched", metadata: { tarification_version: "2026-09-v2" } } as unknown as Stripe.Subscription, "resiliation");
    expect(release).toHaveBeenCalledWith("sched", {}, { idempotencyKey: "abonnement-v2-annuler-calendrier-resiliation" });
    expect(update).toHaveBeenCalledWith("sub", { cancel_at_period_end: true }, expect.anything());
  });
  it("résilier abandonne une hausse dont le paiement est encore en attente", async () => {
    const voidInvoice = vi.fn().mockResolvedValue({}); const update = vi.fn().mockResolvedValue({});
    const stripe = { invoices: { retrieve: vi.fn().mockResolvedValue({ status: "open" }), voidInvoice }, subscriptions: { update } } as unknown as Stripe;
    await resilierAbonnementV2(stripe, { id: "sub", pending_update: {}, latest_invoice: "inv", metadata: { tarification_version: "2026-09-v2" } } as unknown as Stripe.Subscription, "resiliation");
    expect(voidInvoice).toHaveBeenCalledWith("inv", {}, expect.anything()); expect(update).toHaveBeenCalled();
  });

});
