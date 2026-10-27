import type Stripe from "stripe";
import { verifierClientDeLOrganisation } from "@/lib/stripe";

export type CreditOffert = {
 id: string; organization_id: string; mois: number; montant_cents: number;
 client_stripe: string; abonnement_stripe: string; cree_le: string;
};

/** Reprise après coupure : chercher la preuve durable avant toute nouvelle écriture.
 * Après 20 h, ne plus recréer : la clé Stripe n'est pas une garantie perpétuelle.
 * Une absence de preuve ancienne exige un rapprochement, jamais un second cadeau. */
export async function appliquerCreditOffert(stripe: Stripe, cadeau: CreditOffert): Promise<string> {
 const client = await verifierClientDeLOrganisation(stripe, cadeau.client_stripe, cadeau.organization_id);
 if (!client.ok) throw new Error(client.erreur);
 let nombre = 0;
 for await (const transaction of stripe.customers.listBalanceTransactions(cadeau.client_stripe, { limit: 100 })) {
  if (++nombre > 1000) throw new Error("Historique trop long : vérifiez ce crédit dans Stripe avant de reprendre.");
  if (transaction.metadata?.gerimmo_cadeau === cadeau.id) {
   if (transaction.amount !== -Number(cadeau.montant_cents) || transaction.currency !== "eur") {
    throw new Error("La preuve de crédit ne correspond pas au cadeau. Vérification nécessaire.");
   }
   return transaction.id;
  }
 }
 if (Date.now() - Date.parse(cadeau.cree_le) > 20 * 3600_000) {
  throw new Error("Cadeau en attente depuis plus de 20 heures : vérifiez son application dans Stripe avant toute nouvelle tentative.");
 }
 const abonnement = await stripe.subscriptions.retrieve(cadeau.abonnement_stripe);
 const customer = typeof abonnement.customer === "string" ? abonnement.customer : abonnement.customer.id;
 if (customer !== cadeau.client_stripe || !["active", "trialing", "past_due", "unpaid"].includes(abonnement.status)) {
  throw new Error("La souscription a changé depuis la confirmation. Vérifiez le cadeau avant de le reprendre.");
 }
 let mensuel = 0;
 for (const item of abonnement.items.data) {
  const prix = item.price;
  if (prix.currency !== "eur" || prix.unit_amount === null || prix.billing_scheme !== "per_unit" || !prix.recurring ||
      !["month", "year"].includes(prix.recurring.interval) || prix.recurring.interval_count !== 1) {
   throw new Error("Ce tarif demande une vérification avant de créditer les mois offerts.");
  }
  mensuel += prix.unit_amount * (item.quantity ?? 1) / (prix.recurring.interval === "year" ? 12 : 1);
 }
 if (Math.round(mensuel * cadeau.mois) !== Number(cadeau.montant_cents)) {
  throw new Error("Le tarif Stripe diffère du tarif confirmé. Aucun crédit supplémentaire n’a été créé.");
 }
 const transaction = await stripe.customers.createBalanceTransaction(cadeau.client_stripe, {
  amount: -Number(cadeau.montant_cents), currency: "eur",
  description: `Gerimmo — ${cadeau.mois} mois offerts`, metadata: { gerimmo_cadeau: cadeau.id },
 }, { idempotencyKey: `gerimmo-mois-offerts-${cadeau.id}` });
 return transaction.id;
}
