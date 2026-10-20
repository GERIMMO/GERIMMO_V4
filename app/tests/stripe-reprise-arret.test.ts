import { afterEach, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reprendreEvenementsStripe } from "@/lib/stripe-file";
import { ArretSupervision } from "@/lib/controle-effets";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
it("un arrêt pendant la lecture Stripe empêche l’avis de fin d’essai", async () => {
  vi.stubEnv("RESEND_API_KEY", "cle-fictive-sans-reseau");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://gerimmo.test");
  const courrier = vi.fn(); vi.stubGlobal("fetch", courrier);
  let arret = false;
  const avant = vi.fn(async () => { if (arret) throw new ArretSupervision(); });
  const q = { select: () => q, is: () => q, lte: () => q, lt: () => q, order: () => q,
    limit: async () => ({ data: [{ stripe_event_id: "evt_arret", type: "customer.subscription.trial_will_end", charge: { objet: "sub_arret", client: "cus_arret" } }], error: null }),
    eq: () => q, maybeSingle: async () => ({ data: { type: "proprietaire_direct" }, error: null }) };
  const rpc = vi.fn(async (nom: string) => ({ data: nom === "stripe_evenement_prendre" ? "pris" : nom === "abonnement_par_client"
    ? [{ organization_id: "org_fictif", organisation: "Essai fictif", stripe_subscription_id: "sub_arret", destinataire: "fictif@example.invalid" }] : true, error: null }));
  const db = { rpc, from: () => q } as unknown as SupabaseClient;
  const stripe = { subscriptions: { retrieve: async () => {
    arret = true;
    return { id: "sub_arret", customer: "cus_arret", status: "trialing", trial_end: Math.floor(Date.now() / 1000) + 86400, metadata: {}, items: { data: [] } };
  } } } as unknown as Stripe;
  await expect(reprendreEvenementsStripe(db, stripe, avant)).rejects.toBeInstanceOf(ArretSupervision);
  expect(avant).toHaveBeenCalledTimes(2);
  expect(courrier).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenLastCalledWith("stripe_evenement_finir", expect.objectContaining({ p_reussi: false }));
});
