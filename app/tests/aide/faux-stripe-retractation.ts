/**
 * Une doublure Stripe À ÉTAT pour la rétractation (relecture adverse du 24/10, point 8). Elle reproduit ce que Stripe
 * fait réellement, là où la doublure figée des premiers tests ne le faisait pas :
 *  · la souscription change d'intervalle après `update` (retour au mensuel, `billing_cycle_anchor: "now"`, qui facture
 *    et prélève aussitôt la première mensualité) et de statut après `cancel` ;
 *  · `invoices.list` respecte ses filtres `subscription`, `status` et `created` ;
 *  · une clé d'idempotence rend la réponse mise en cache pendant 24 h (succès comme erreur Stripe), et refuse d'autres
 *    paramètres ;
 *  · un paiement déjà remboursé en entier est refusé « charge_already_refunded » ; `refunds.list` rend les
 *    remboursements du paiement avec leurs métadonnées ;
 *  · une coupure réseau (`echecsRemboursement`) n'a aucun effet.
 */
import type Stripe from "stripe";

type Facture = {
  id: string;
  subscription: string;
  status: "paid" | "open" | "void";
  created: number;
  amount_paid: number;
  pi: string | null;
  jours: number;
};
type Remboursement = { id: string; payment_intent: string; amount: number; status: "succeeded"; metadata: Record<string, string> };

export class FauxStripeRetractation {
  intervalle: "month" | "year";
  statut = "active";
  factures: Facture[] = [];
  paiements = new Map<string, { montant: number; rembourse: number }>();
  remboursements: Remboursement[] = [];
  cache = new Map<string, { params: string; reponse: unknown }>();
  echecsRemboursement = 0;
  appels = { update: 0, cancel: 0, voidInvoice: 0 };
  maintenant: number;
  compteur = 0;

  constructor(o: { intervalle: "month" | "year"; maintenant: number }) {
    this.intervalle = o.intervalle;
    this.maintenant = o.maintenant;
  }

  payer(f: Omit<Facture, "status" | "subscription"> & { status?: Facture["status"] }) {
    this.factures.push({ ...f, status: f.status ?? "paid", subscription: "sub_1" });
    if (f.pi && (f.status ?? "paid") === "paid") this.paiements.set(f.pi, { montant: f.amount_paid, rembourse: 0 });
  }

  /** Un remboursement fait hors de la rétractation (geste commercial). */
  rembourserHors(pi: string, montant: number) {
    const p = this.paiements.get(pi)!;
    p.rembourse += montant;
    this.remboursements.push({ id: `re_hors_${pi}`, payment_intent: pi, amount: montant, status: "succeeded", metadata: {} });
  }

  /** Les 24 h de la clé d'idempotence passées. */
  oublierCles() {
    this.cache.clear();
  }

  rembourseSur(pi: string): number {
    return this.paiements.get(pi)?.rembourse ?? 0;
  }

  async idem<T>(cle: string | undefined, params: unknown, fn: () => Promise<T>): Promise<T> {
    if (!cle) return fn();
    const p = JSON.stringify(params);
    const deja = this.cache.get(cle);
    if (deja) {
      if (deja.params !== p) throw Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters"), { type: "StripeIdempotencyError" });
      if (deja.reponse instanceof Error) throw deja.reponse;
      return deja.reponse as T;
    }
    try {
      const r = await fn();
      this.cache.set(cle, { params: p, reponse: r });
      return r;
    } catch (e) {
      if ((e as { code?: string }).code) this.cache.set(cle, { params: p, reponse: e });
      throw e;
    }
  }

  client(): Stripe {
    return construireClient(this);
  }
}

function construireClient(moi: FauxStripeRetractation): Stripe {
    const factureStripe = (f: Facture) => ({
      id: f.id,
      status: f.status,
      amount_paid: f.status === "paid" ? f.amount_paid : 0,
      payments: { data: f.pi && f.status === "paid" ? [{ status: "paid", payment: { type: "payment_intent", payment_intent: f.pi } }] : [] },
      lines: { data: [{ period: { start: f.created, end: f.created + f.jours * 86_400 } }] },
    });
    return {
      subscriptions: {
        retrieve: async () => ({
          id: "sub_1",
          status: moi.statut,
          schedule: null,
          metadata: {},
          start_date: moi.maintenant - 30 * 86_400,
          items: { data: [{ id: "si_1", price: { recurring: { interval: moi.intervalle } } }] },
        }),
        cancel: async (_id: string, params: unknown, o?: { idempotencyKey?: string }) =>
          moi.idem(o?.idempotencyKey, params, async () => {
            moi.appels.cancel += 1;
            moi.statut = "canceled";
            return { id: "sub_1", status: "canceled" };
          }),
        update: async (_id: string, params: unknown, o?: { idempotencyKey?: string }) =>
          moi.idem(o?.idempotencyKey, params, async () => {
            moi.appels.update += 1;
            moi.intervalle = "month";
            moi.compteur += 1;
            moi.payer({ id: `in_mois_${moi.compteur}`, created: moi.maintenant, amount_paid: 599, pi: `pi_mois_${moi.compteur}`, jours: 30 });
            return { id: "sub_1" };
          }),
      },
      subscriptionSchedules: { retrieve: async () => ({ status: "released" }), release: async () => ({}) },
      invoices: {
        list: async (p: { subscription: string; status?: string; created?: { gte: number } }) => ({
          data: moi.factures
            .filter((f) => f.subscription === p.subscription && (!p.status || f.status === p.status) && (!p.created || f.created >= p.created.gte))
            .map(factureStripe),
        }),
        voidInvoice: async (id: string, params: unknown, o?: { idempotencyKey?: string }) =>
          moi.idem(o?.idempotencyKey, params, async () => {
            moi.appels.voidInvoice += 1;
            const f = moi.factures.find((x) => x.id === id);
            if (f) f.status = "void";
            return { id };
          }),
      },
      refunds: {
        create: async (params: { payment_intent?: string; metadata?: Record<string, string> }, o?: { idempotencyKey?: string }) => {
          if (moi.echecsRemboursement > 0) {
            moi.echecsRemboursement -= 1;
            throw Object.assign(new Error("Connection to Stripe timed out"), { type: "StripeConnectionError" });
          }
          return moi.idem(o?.idempotencyKey, params, async () => {
            const p = moi.paiements.get(String(params.payment_intent));
            if (!p) throw Object.assign(new Error("No such payment_intent"), { code: "resource_missing", type: "StripeInvalidRequestError" });
            const reste = p.montant - p.rembourse;
            if (reste <= 0) throw Object.assign(new Error("Charge has already been refunded."), { code: "charge_already_refunded", type: "StripeInvalidRequestError" });
            p.rembourse += reste;
            const r: Remboursement = {
              id: `re_${params.payment_intent}_${moi.remboursements.length + 1}`,
              payment_intent: String(params.payment_intent),
              amount: reste,
              status: "succeeded",
              metadata: params.metadata ?? {},
            };
            moi.remboursements.push(r);
            return r;
          });
        },
        list: async (p: { payment_intent?: string }) => ({ data: moi.remboursements.filter((r) => r.payment_intent === p.payment_intent) }),
      },
    } as unknown as Stripe;
}
