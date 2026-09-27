import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VERSION_TARIFICATION } from "@/lib/tarification";
import { configurationStripeV2, finEssaiV2, terminerSouscriptionEssaiV2, snapshotSouscriptionV2, type PropositionStripeV2 } from "@/lib/stripe-tarification";

/** Un événement signé déclenche une lecture de l’état actuel, pas l’application d’un ancien instantané. */
export async function traiterEvenementStripeV2(stripe: Stripe, supabase: SupabaseClient, evenement: Stripe.Event): Promise<{ traite: boolean; organisation?: string | null }> {
  const object = evenement.data.object as Stripe.Subscription | Stripe.Checkout.Session;
  if (!("metadata" in object) || object.metadata?.tarification_version !== VERSION_TARIFICATION) return { traite: false };
  const config = configurationStripeV2();
  if (evenement.livemode !== config.reel || object.livemode !== config.reel) throw new Error("Le mode du paiement ne correspond pas à cette installation.");
  const org = object.metadata.organization_id;
  const propositionId = object.metadata.proposition_id;
  if (!org || !propositionId) throw new Error("Le paiement ne porte pas de confirmation Gerimmo.");
  const { data: proposition, error } = await supabase.rpc("lire_proposition_abonnement_service_v2", { p_proposition: propositionId });
  if (error || !proposition || proposition.organization_id !== org || !proposition.consentie_le) throw new Error("La confirmation de cette souscription est introuvable.");
  const p = proposition.snapshot as PropositionStripeV2;
  const customer = typeof object.customer === "string" ? object.customer : object.customer?.id;
  if (customer !== p.stripe_customer_id) throw new Error("Le client de ce paiement ne correspond pas à sa confirmation.");
  let subscription: Stripe.Subscription;
  if (evenement.type === "checkout.session.expired") {
    const termine = await supabase.rpc("finir_proposition_abonnement_v2", { p_proposition: propositionId, p_etat: "expiree" });
    if (termine.error) throw new Error("L’expiration de la page de paiement n’a pas pu être enregistrée.");
    return { traite: true, organisation: org };
  }
  if (evenement.type === "checkout.session.completed") {
    const session = await stripe.checkout.sessions.retrieve(object.id);
    if (session.mode === "setup") {
      if (!finEssaiV2(p.essai_fin)) {
        const fini = await supabase.rpc("finir_proposition_abonnement_v2", { p_proposition: propositionId, p_etat: "expiree" });
        if (fini.error) throw new Error("La demande expirée n’a pas pu être clôturée.");
        return { traite: true, organisation: org };
      }
      subscription = await terminerSouscriptionEssaiV2(stripe, session, p, org, propositionId);
    }
    else {
      const id = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (!id) throw new Error("La souscription n’a pas encore été créée par le prestataire.");
      subscription = await stripe.subscriptions.retrieve(id);
    }
  } else subscription = await stripe.subscriptions.retrieve(object.id);
  if (subscription.metadata.organization_id !== org) throw new Error("La souscription ne correspond plus à cette organisation.");
  const snapshot = await snapshotSouscriptionV2(stripe, config, subscription);
  const applique = await supabase.rpc("appliquer_abonnement_v2", { p_org: org, p_snapshot: snapshot, p_event_id: evenement.id });
  if (applique.error) throw new Error("Le nouvel état de l’abonnement n’a pas pu être enregistré.");
  if (!subscription.pending_update && ["active", "trialing"].includes(subscription.status)) {
    const termine = await supabase.rpc("finir_proposition_abonnement_v2", { p_proposition: propositionId, p_etat: "executee" });
    if (termine.error) throw new Error("La confirmation de l’abonnement n’a pas pu être terminée.");
  }
  return { traite: true, organisation: org };
}
