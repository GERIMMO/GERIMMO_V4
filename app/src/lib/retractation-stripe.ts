// LA RÉTRACTATION CHEZ STRIPE (plan de conformité du 23/10/2026, R01 et R37 ; décision 5 : remboursements
// protecteurs, « oui à tout »).
//
//  · Abonnement : la souscription prend fin tout de suite (commentaire « gerimmo:retractation » : le webhook n'y voit
//    pas une résiliation pour impayé), la facture restée ouverte est annulée, et CHAQUE paiement de la souscription est
//    remboursé en entier, sur le moyen de paiement utilisé.
//  · Passage à l'annuel encore programmé : l'échéancier est libéré ; rien n'est prélevé ni remboursé.
//  · Passage à l'annuel déjà effectué : retour au prix mensuel (sans prorata, nouveau cycle à compter de ce jour) et
//    remboursement intégral des échéances annuelles payées depuis la demande.
//
// Tout est rejouable : chaque écriture porte une clé d'idempotence dérivée de la déclaration (`retractation-{id}-…`),
// un remboursement déjà fait est reconnu. Les montants viennent de Stripe, jamais du navigateur.

import type Stripe from "stripe";
import { ArretSupervision } from "@/lib/controle-effets";
import {
  elementsDeMiseAJour,
  libererEcheancier,
  lignesStripe,
  metadonneesOffre,
  type ChoixOffre,
} from "@/lib/stripe-offres";
import type { Offre, RegimeTva } from "@/lib/tarifs";

/** Le commentaire d'annulation d'une souscription rétractée : le webhook n'y voit pas une résiliation pour impayé. */
export const COMMENTAIRE_RETRACTATION = "gerimmo:retractation";

export type Remboursement = { facture: string; refund: string | null; montant_cents: number; deja?: true };
export type ExecutionRetractation = { montantCents: number; refunds: Remboursement[] };

function idDe(v: string | { id: string } | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

/** Le moyen de rembourser une facture payée : son paiement (PaymentIntent, ou charge sans intention). */
function paiementsDe(f: Stripe.Invoice): { payment_intent?: string; charge?: string }[] {
  const liste = f.payments?.data ?? [];
  return liste
    .filter((p) => p.status === "paid" || p.status === undefined)
    .map((p) => {
      const pi = idDe(p.payment?.payment_intent as string | { id: string } | undefined);
      const ch = idDe(p.payment?.charge as string | { id: string } | undefined);
      return pi ? { payment_intent: pi } : ch ? { charge: ch } : {};
    })
    .filter((x) => x.payment_intent || x.charge);
}

/** Rembourse en entier chaque facture payée de la liste ; un remboursement déjà fait est reconnu, pas refait. */
export async function rembourserFactures(stripe: Stripe, factures: Stripe.Invoice[], cle: string): Promise<ExecutionRetractation> {
  const refunds: Remboursement[] = [];
  let montantCents = 0;
  for (const f of factures) {
    if (!f.id || !(f.amount_paid > 0)) continue;
    const paiements = paiementsDe(f);
    if (paiements.length === 0) throw new Error(`Paiement introuvable pour la facture ${f.id}.`);
    for (const [i, p] of paiements.entries()) {
      try {
        const r = await stripe.refunds.create(
          { ...p, reason: "requested_by_customer", metadata: { gerimmo_retractation: cle, facture: f.id } },
          { idempotencyKey: `${cle}-${f.id}-${i}` }
        );
        refunds.push({ facture: f.id, refund: r.id, montant_cents: r.amount });
        montantCents += r.amount;
      } catch (e) {
        if (e instanceof ArretSupervision) throw e;
        if ((e as { code?: string }).code === "charge_already_refunded") {
          refunds.push({ facture: f.id, refund: null, montant_cents: f.amount_paid, deja: true });
          montantCents += f.amount_paid;
          continue;
        }
        throw e;
      }
    }
  }
  return { montantCents, refunds };
}

async function facturesPayees(stripe: Stripe, subscription: string, depuisS?: number): Promise<Stripe.Invoice[]> {
  const liste = await stripe.invoices.list({
    subscription,
    status: "paid",
    limit: 100,
    expand: ["data.payments"],
    ...(depuisS ? { created: { gte: depuisS } } : {}),
  });
  return liste.data;
}

async function annulerFacturesOuvertesDe(stripe: Stripe, subscription: string, cle: string): Promise<string[]> {
  const ouvertes = await stripe.invoices.list({ subscription, status: "open", limit: 20 });
  const annulees: string[] = [];
  for (const f of ouvertes.data) {
    if (!f.id) continue;
    await stripe.invoices.voidInvoice(f.id, {}, { idempotencyKey: `${cle}-annulation-${f.id}` });
    annulees.push(f.id);
  }
  return annulees;
}

/** R01 : fin immédiate de la souscription, facture ouverte annulée, chaque paiement remboursé en entier. */
export async function retracterSouscription(stripe: Stripe, p: { subscription: string; cle: string }): Promise<ExecutionRetractation> {
  const s = await stripe.subscriptions.retrieve(p.subscription);
  if (s.status !== "canceled" && s.status !== "incomplete_expired") {
    await stripe.subscriptions.cancel(
      p.subscription,
      { cancellation_details: { comment: COMMENTAIRE_RETRACTATION }, invoice_now: false, prorate: false },
      { idempotencyKey: `${p.cle}-fin` }
    );
  }
  await annulerFacturesOuvertesDe(stripe, p.subscription, p.cle);
  return rembourserFactures(stripe, await facturesPayees(stripe, p.subscription), p.cle);
}

/**
 * R37 : la rétractation d'un passage à l'annuel. Déjà effectué (souscription facturée à l'année) : retour au mensuel et
 * remboursement des échéances annuelles payées depuis la demande. Encore programmé : l'échéancier est libéré.
 */
export async function retracterPassageAnnuel(
  stripe: Stripe,
  p: { subscription: string; cle: string; orgId: string; offreMensuelle: Offre; regime: RegimeTva; demandeLe: Date; choix: ChoixOffre }
): Promise<ExecutionRetractation & { passageEffectue: boolean }> {
  const s = await stripe.subscriptions.retrieve(p.subscription);
  const annuel = s.items?.data?.[0]?.price?.recurring?.interval === "year";
  await libererEcheancier(stripe, s);
  if (!annuel) return { montantCents: 0, refunds: [], passageEffectue: false };
  // L'échéance annuelle restée impayée est annulée ; celle qui est payée est remboursée.
  await annulerFacturesOuvertesDe(stripe, p.subscription, p.cle);
  const lignes = await lignesStripe(stripe, p.offreMensuelle, p.regime);
  await stripe.subscriptions.update(
    p.subscription,
    {
      items: elementsDeMiseAJour(s.items.data, lignes) as Stripe.SubscriptionUpdateParams.Item[],
      proration_behavior: "none",
      billing_cycle_anchor: "now",
      metadata: metadonneesOffre(p.orgId, p.offreMensuelle, p.choix),
    },
    { idempotencyKey: `${p.cle}-mensuel` }
  );
  const depuis = Math.floor(p.demandeLe.getTime() / 1000);
  const annuelles = (await facturesPayees(stripe, p.subscription, depuis)).filter(estFactureAnnuelle);
  return { ...(await rembourserFactures(stripe, annuelles, p.cle)), passageEffectue: true };
}

/** Une facture d'échéance annuelle : une de ses lignes couvre plus de 200 jours (douze mois). */
export function estFactureAnnuelle(f: Pick<Stripe.Invoice, "lines">): boolean {
  return (f.lines?.data ?? []).some((l) => l.period && l.period.end - l.period.start > 200 * 86_400);
}
