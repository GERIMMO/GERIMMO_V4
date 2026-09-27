import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), terminer: vi.fn() }));
vi.mock("@/lib/stripe-tarification", async importer => ({ ...(await importer<typeof import("@/lib/stripe-tarification")>()), snapshotSouscriptionV2: mocks.snapshot, terminerSouscriptionEssaiV2: mocks.terminer }));
import { traiterEvenementStripeV2 } from "@/lib/stripe-webhook-v2";
const metadata = { tarification_version: "2026-09-v2", organization_id: "org", proposition_id: "prop" };
function evenement(type = "customer.subscription.updated", details = {}) { return { id: "evt", livemode: false, type, data: { object: { id: "sub", livemode: false, customer: "cus", metadata, status: "active", ...details } } } as unknown as Stripe.Event; }
function client(consentie = true) {
  const rpc = vi.fn(async (nom: string) => nom === "lire_proposition_abonnement_service_v2"
    ? { data: { organization_id: "org", consentie_le: consentie ? "2026-09-28" : null, snapshot: { stripe_customer_id: "cus", essai_fin: "2026-09-01T00:00:00Z" } }, error: null }
    : { data: true, error: null });
  return { rpc, supabase: { rpc } as unknown as SupabaseClient };
}
beforeEach(() => { vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x"); vi.stubEnv("STRIPE_CATALOGUE_V2_JSON", "{}"); vi.stubEnv("STRIPE_FISCALITE_V2_JSON", JSON.stringify({ mode: "exonere", mention: "Scénario de test" })); mocks.snapshot.mockImplementation(async (_s, _c, sub) => ({ stripe_statut: sub.status })); });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("confirmations Stripe V2", () => {
  it("un événement ancien relit la souscription actuelle au lieu de réouvrir le compte", async () => {
    const { supabase, rpc } = client(); const retrieve = vi.fn().mockResolvedValue({ id: "sub", metadata, status: "canceled" });
    const r = await traiterEvenementStripeV2({ subscriptions: { retrieve } } as unknown as Stripe, supabase, evenement());
    expect(r.traite).toBe(true); expect(retrieve).toHaveBeenCalledWith("sub");
    expect(rpc).toHaveBeenCalledWith("appliquer_abonnement_v2", { p_org: "org", p_event_id: "evt", p_snapshot: { stripe_statut: "canceled", traitement_token: expect.any(String) } });
  });
  it("aucun accord enregistré : même un événement Stripe valide n’accorde pas de capacité", async () => {
    const { supabase, rpc } = client(false); const retrieve = vi.fn();
    await expect(traiterEvenementStripeV2({ subscriptions: { retrieve } } as unknown as Stripe, supabase, evenement())).rejects.toThrow("confirmation");
    expect(retrieve).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("refuse un événement d’un autre client", async () => {
    const { supabase } = client(); await expect(traiterEvenementStripeV2({} as Stripe, supabase, evenement(undefined, { customer: "cus_autre" }))).rejects.toThrow("client");
  });
  it("refuse le mélange test/réel avant de lire une confirmation", async () => {
    const { supabase, rpc } = client(); await expect(traiterEvenementStripeV2({} as Stripe, supabase, { ...evenement(), livemode: true })).rejects.toThrow("mode"); expect(rpc).not.toHaveBeenCalled();
  });
  it("carte validée après la fin d’essai : clôture la demande sans débit ni boucle de relance", async () => {
    const { supabase, rpc } = client(); const retrieve = vi.fn().mockResolvedValue({ mode: "setup" });
    const r = await traiterEvenementStripeV2({ checkout: { sessions: { retrieve } } } as unknown as Stripe, supabase, evenement("checkout.session.completed"));
    expect(r.traite).toBe(true); expect(mocks.terminer).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("finir_proposition_abonnement_v2", { p_proposition: "prop", p_etat: "expiree" });
    expect(rpc.mock.calls.some(([nom]) => nom === "appliquer_abonnement_v2")).toBe(false);
  });
  it("l’expiration Checkout libère la demande sans créer de souscription", async () => {
    const { supabase, rpc } = client(); expect((await traiterEvenementStripeV2({} as Stripe, supabase, evenement("checkout.session.expired"))).traite).toBe(true);
    expect(rpc).toHaveBeenCalledWith("finir_proposition_abonnement_v2", { p_proposition: "prop", p_etat: "expiree" });
  });
});
