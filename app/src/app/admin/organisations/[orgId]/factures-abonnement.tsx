import "server-only";
import Link from "next/link";
import type Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { clientDeService } from "@/lib/supabase/service";
import { clientStripe, configurationStripe } from "@/lib/stripe";
import { euros } from "@/lib/tarifs";
import { formaterDateHeureParis } from "@/lib/heure-paris";

const STATUTS: Record<string,string> = { draft: "Brouillon", open: "Ouverte", paid: "Soldée", void: "Annulée", uncollectible: "Irrécouvrable" };
const indisponible = <p role="alert">Historique indisponible. Vérifiez le dossier et son rattachement dans Stripe avant toute décision.</p>;

function reference(objet: string | { id: string } | null | undefined) {
  return typeof objet === "string" ? objet : objet?.id;
}

/** Lecture demandée depuis la fiche client. Le navigateur ne fournit aucune référence Stripe. */
export async function FacturesAbonnement({ organisation }: { organisation: string }) {
  const db = await createClient();
  const droit = await db.rpc("is_permanent_super_admin");
  if (droit.error || droit.data !== true) return <p role="alert">Cette lecture est réservée au super-administrateur permanent.</p>;
  const trace = await db.rpc("log_sa_access", { org: organisation, sa_action: "consultation_factures_abonnement" });
  if (trace.error) return indisponible;

  let factures: Stripe.ApiList<Stripe.Invoice> | null = null;
  try {
    const service = clientDeService();
    if (!service) return indisponible;
    const contrat = await service.from("abonnements").select("stripe_customer_id,stripe_subscription_id")
      .eq("organization_id", organisation).maybeSingle();
    if (contrat.error) return indisponible;
    const client = contrat.data?.stripe_customer_id;
    const abonnement = contrat.data?.stripe_subscription_id;
    if (abonnement) {
      const config = configurationStripe();
      if (!client || !config.pret) return indisponible;
      const stripe = clientStripe(config.config);
      const lecture = { timeout: 8000, maxNetworkRetries: 0 };
      const souscription = await stripe.subscriptions.retrieve(abonnement, {}, lecture);
      if (souscription.id !== abonnement || reference(souscription.customer) !== client || souscription.metadata?.organization_id !== organisation) return indisponible;
      factures = await stripe.invoices.list({ customer: client, subscription: abonnement, limit: 10 }, lecture);
      if (factures.data.some(f => !f.id || f.currency !== "eur" || reference(f.customer) !== client ||
        reference(f.parent?.subscription_details?.subscription) !== abonnement)) return indisponible;
    }
  } catch {
    return indisponible;
  }
  if (!factures) return <p>Aucun abonnement Stripe rattaché à ce dossier.</p>;
  if (!factures.data.length) return <p>Aucune facture Stripe pour cet abonnement.</p>;
  return <section aria-label="Dernières factures de l’abonnement" className="space-y-3">
    <h3 className="font-semibold">Dernières factures de l’abonnement</h3>
    <ul className="divide-y">{factures.data.map(f => <li key={f.id} className="py-2 text-sm">
      <strong>{f.number ?? "Facture sans numéro"}</strong> · {formaterDateHeureParis(new Date(f.created * 1000).toISOString())} · {(f.status && STATUTS[f.status]) || "État inconnu"}
      <p>Montant payé affecté à la facture : {euros(f.amount_paid)} · Restant dû : {euros(f.amount_remaining)}.</p>
      {(f.post_payment_credit_notes_amount > 0 || f.pre_payment_credit_notes_amount > 0) &&
        <p>Avoirs émis : {euros(f.pre_payment_credit_notes_amount + f.post_payment_credit_notes_amount)}.</p>}
    </li>)}</ul>
    <p className="text-sm">Un avoir peut solder une facture. Le remboursement sur carte se vérifie dans le détail du paiement Stripe.</p>
    {factures.has_more && <p className="text-sm">Les dix factures les plus récentes sont affichées. Les précédentes restent consultables dans Stripe.</p>}
  </section>;
}

export function ProcedureFacturation({ organisation }: { organisation: string }) {
  return <details className="mt-4 text-sm">
    <summary className="cursor-pointer font-semibold">Traiter une demande de remboursement ou d’avoir</summary>
    <ol className="mt-3 list-decimal space-y-2 pl-5">
      <li>Ouvrez le <Link href={`/admin/retours?org=${organisation}`} className="lien-texte">dossier de support</Link>. Vérifiez le demandeur, le motif, la facture, le montant autorisé et les décisions déjà prises.</li>
      <li>Pour une rétractation déclarée, utilisez le parcours de rétractation. Avant toute autre décision, vérifiez dans Stripe l’abonnement, la facture, les avoirs et l’état des remboursements déjà demandés.</li>
      <li>Dans Stripe, ouvrez la facture puis « Émettre un avoir » pour corriger la facture. Vérifiez si ce geste prévoit déjà un remboursement. Pour un remboursement seul, passez par le paiement d’origine.</li>
      <li>Consignez les références, le montant et l’état retournés dans le dossier de support. Si l’état reste incertain ou si un remboursement est en attente, vérifiez-le dans Stripe avant toute nouvelle action.</li>
    </ol>
  </details>;
}
