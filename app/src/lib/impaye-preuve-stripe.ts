import type Stripe from "stripe";
import { clientStripe, configurationStripe } from "./stripe";
import { RefusContexteCourriel } from "./finalisation-courriels";

function reference(objet: string | { id: string } | null | undefined) {
  return typeof objet === "string" ? objet : objet?.id;
}

/** Une facture créditée, payée, d'une autre souscription ou libellée dans une autre devise ne prouve pas la créance annoncée. */
export async function factureImpayee(subscription: string, montant: number, stripe?: Stripe): Promise<string> {
  if (!stripe) {
    const reglage = configurationStripe();
    if (!reglage.pret) throw new RefusContexteCourriel("Vérification du défaut chez Stripe indisponible.", true);
    stripe = clientStripe(reglage.config);
  }
  let s: Stripe.Subscription;
  try {
    s = await stripe.subscriptions.retrieve(subscription, { expand: ["latest_invoice"] });
  } catch {
    throw new RefusContexteCourriel("État du prélèvement indisponible chez Stripe.", true);
  }
  const f = s.latest_invoice;
  if (s.id !== subscription || !["past_due", "unpaid"].includes(s.status) || !f || typeof f === "string"
    || f.status !== "open" || f.currency !== "eur" || f.amount_remaining !== montant || montant <= 0
    || reference(f.parent?.subscription_details?.subscription) !== s.id || !reference(s.customer)
    || reference(f.customer) !== reference(s.customer)) {
    throw new RefusContexteCourriel("La facture ouverte ne confirme pas le défaut et le montant annoncés. Vérifiez le dossier.");
  }
  return f.id;
}
