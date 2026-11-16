import type Stripe from "stripe";
import type { AvisCommercial } from "./finalisation-courriels";
import { RefusContexteCourriel } from "./finalisation-courriels";
import { clientStripe, configurationStripe } from "./stripe";

/** La prévisualisation Stripe tient compte des avoirs, réductions et taxes. Elle ne crée aucune facture. */
export async function verifierPrelevementPrevu(c: Extract<AvisCommercial,{type:"fin_essai_choisi"}>, stripe?: Stripe) {
  if (!stripe) {
    const config = configurationStripe();
    if (!config.pret) throw new RefusContexteCourriel("Vérification Stripe indisponible.", true);
    stripe = clientStripe(config.config);
  }
  const s = await stripe.subscriptions.retrieve(c.id);
  const client = typeof s.customer === "string" ? s.customer : s.customer.id;
  if (client !== c.client || s.status !== "trialing" || !s.trial_end || s.trial_end * 1000 !== Date.parse(c.fin)
      || Date.parse(c.fin) <= Date.now() || s.cancel_at || s.cancel_at_period_end || s.pause_collection
      || s.collection_method !== "charge_automatically") {
    throw new RefusContexteCourriel("Le prélèvement annoncé n’est plus prévu pour ce contrat.");
  }
  const f = await stripe.invoices.createPreview({ customer: client, subscription: s.id });
  if (f.currency !== "eur" || f.amount_due !== c.montant || f.period_end !== s.trial_end) {
    throw new RefusContexteCourriel("Le montant ou la date prévus par Stripe ont changé. Vérifiez l’échéance.");
  }
}
