/**
 * La rétractation (plan de conformité du 23/10/2026, R01 et R37 ; décision 5 : remboursements protecteurs), sans base
 * ni Stripe réels : l'état du droit calculé pour l'écran et l'action, puis l'exécution chez Stripe sur une doublure.
 *
 *  · le délai court depuis la souscription (ou la demande de passage à l'annuel), se ferme à 23 h 59 min 59 s le
 *    dernier jour, et une déclaration enregistrée le ferme ;
 *  · abonnement : fin immédiate marquée « gerimmo:retractation », facture ouverte annulée, CHAQUE paiement remboursé
 *    en entier, une fois (clé d'idempotence, remboursement déjà fait reconnu) ;
 *  · passage à l'annuel : programmé, l'échéancier est libéré sans rien rembourser ; effectué, retour au mensuel sans
 *    prorata et remboursement des seules échéances annuelles payées depuis la demande.
 *
 * Relecture adverse du 24/10 : une doublure Stripe À ÉTAT (tests/aide/faux-stripe-retractation.ts, point 8) rejoue
 * les reprises après un échec partiel — passage effectué dont le remboursement échoue après le retour au mensuel
 * (point 1), remboursement « déjà fait » après 24 h avec un geste commercial antérieur (point 6) ; une déclaration
 * enregistrée garde son droit quand la périodicité a changé (point 1).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const offres = vi.hoisted(() => ({
  libererEcheancier: vi.fn(async () => true),
  lignesStripe: vi.fn(async () => [{ price: "price_mensuel", quantity: 1 }]),
}));
vi.mock("@/lib/stripe-offres", async (importer) => {
  const vrai = await importer<typeof import("@/lib/stripe-offres")>();
  return {
    ...vrai,
    libererEcheancier: offres.libererEcheancier,
    lignesStripe: offres.lignesStripe,
    elementsDeMiseAJour: () => [{ id: "si_1", price: "price_mensuel", quantity: 1 }],
  };
});

import { etatRetractation, type LigneRetractation } from "@/lib/retractation-etat";
import {
  COMMENTAIRE_RETRACTATION,
  estFactureAnnuelle,
  rembourserFactures,
  retracterPassageAnnuel,
  retracterSouscription,
} from "@/lib/retractation-stripe";
import { offreParticulier } from "@/lib/tarifs";
import { FauxStripeRetractation } from "./aide/faux-stripe-retractation";

function ligne(l: Partial<LigneRetractation> = {}): LigneRetractation {
  return {
    souscrit_le: "2026-10-01T08:00:00Z",
    abonnement_suivi: true,
    stripe_statut: "active",
    essai_fin: null,
    periodicite: "mensuel",
    periodicite_suivante: null,
    passage_annuel_demande_le: null,
    formule: "solo",
    organisation: "Espace fictif",
    destinataire: "titulaire@example.com",
    retractation_abonnement_le: null,
    retractation_passage_le: null,
    ...l,
  };
}

describe("l'état du droit de rétractation", () => {
  it("ouvert jusqu'au quatorzième jour à 23 h 59 min 59 s (heure de Paris), fermé une seconde après", () => {
    // Jeudi 1er octobre 2026 : le délai finit le jeudi 15 octobre (heure d'été : 23 h 59 à Paris = 21 h 59 UTC).
    const avant = etatRetractation(ligne(), new Date("2026-10-15T21:59:59Z"));
    expect(avant.abonnement).toMatchObject({ ouverte: true, dernierJour: "2026-10-15", declareeLe: null });
    expect(etatRetractation(ligne(), new Date("2026-10-15T22:00:00Z")).abonnement.ouverte).toBe(false);
  });

  it("une déclaration enregistrée ferme le délai et l'expose ; elle ferme aussi celui du passage à l'annuel", () => {
    const e = etatRetractation(
      ligne({ retractation_abonnement_le: "2026-10-03T10:00:00Z", periodicite_suivante: "annuel", passage_annuel_demande_le: "2026-10-02T10:00:00Z" }),
      new Date("2026-10-04T10:00:00Z")
    );
    expect(e.abonnement).toMatchObject({ ouverte: false, declareeLe: "2026-10-03T10:00:00Z" });
    expect(e.passage.ouverte).toBe(false);
  });

  it("une souscription que la base n'a pas encore datée prend la date relue chez Stripe ; sans aucune date, rien n'est ouvert", () => {
    const sansDate = ligne({ souscrit_le: null });
    expect(etatRetractation(sansDate, new Date("2026-10-05T10:00:00Z")).abonnement).toMatchObject({ ouverte: false, conclusion: null });
    const e = etatRetractation(sansDate, new Date("2026-10-05T10:00:00Z"), new Date("2026-10-01T08:00:00Z"));
    expect(e.abonnement).toMatchObject({ ouverte: true, dernierJour: "2026-10-15" });
  });

  it("sans souscription suivie (essai sans paiement), il n'y a rien à rétracter", () => {
    const e = etatRetractation(ligne({ abonnement_suivi: false }), new Date("2026-10-02T10:00:00Z"));
    expect(e.abonnement.ouverte).toBe(false);
    expect(e.passage.ouverte).toBe(false);
    expect(etatRetractation(null).abonnement.ouverte).toBe(false);
  });

  it("R37 : le passage à l'annuel a son propre délai, programmé comme effectué", () => {
    const demande = "2026-11-02T09:00:00Z"; // lundi : fin le lundi 16 novembre
    const programme = etatRetractation(
      ligne({ souscrit_le: "2026-09-01T08:00:00Z", periodicite_suivante: "annuel", passage_annuel_demande_le: demande }),
      new Date("2026-11-10T09:00:00Z")
    );
    expect(programme.abonnement.ouverte).toBe(false);
    expect(programme.passage).toMatchObject({ ouverte: true, dernierJour: "2026-11-16", effectue: false });
    const effectue = etatRetractation(
      ligne({ souscrit_le: "2026-09-01T08:00:00Z", periodicite: "annuel", passage_annuel_demande_le: demande }),
      new Date("2026-11-10T09:00:00Z")
    );
    expect(effectue.passage).toMatchObject({ ouverte: true, effectue: true });
    // Une demande retirée (mensuel, plus de suivante annuelle) n'ouvre rien.
    const retiree = etatRetractation(ligne({ passage_annuel_demande_le: demande }), new Date("2026-11-10T09:00:00Z"));
    expect(retiree.passage.ouverte).toBe(false);
  });

  it("relecture adverse (point 1) : une déclaration de passage enregistrée garde son droit quand l'abonnement est redevenu mensuel", () => {
    const demande = "2026-11-02T09:00:00Z";
    // Première exécution : retour au mensuel fait, remboursement échoué ; le webhook a remis la périodicité au mois.
    const e = etatRetractation(
      ligne({ souscrit_le: "2026-09-01T08:00:00Z", passage_annuel_demande_le: demande, retractation_passage_le: "2026-11-10T09:00:00Z" }),
      new Date("2026-12-01T09:00:00Z") // bien après le délai : la reprise reste ouverte
    );
    expect(e.passage).toMatchObject({ ouverte: false, conclusion: new Date(demande), declareeLe: "2026-11-10T09:00:00Z" });
    // Une exécution consignée dit si le passage était effectué, quelle que soit la périodicité d'aujourd'hui.
    const consignee = etatRetractation(
      ligne({ souscrit_le: "2026-09-01T08:00:00Z", passage_annuel_demande_le: demande, retractation_passage_le: "2026-11-10T09:00:00Z", retractation_passage_effectue: true }),
      new Date("2026-12-01T09:00:00Z")
    );
    expect(consignee.passage.effectue).toBe(true);
  });
});

// ── La doublure Stripe ────────────────────────────────────────────────────────────────────────────────────────────

type Facture = Partial<Stripe.Invoice> & { id: string; amount_paid: number };

function facture(id: string, montant: number, pi: string | null, jours = 30): Facture {
  return {
    id,
    status: "paid",
    amount_paid: montant,
    payments: { data: pi ? [{ status: "paid", payment: { type: "payment_intent", payment_intent: pi } }] : [] } as unknown as Stripe.Invoice["payments"],
    lines: { data: [{ period: { start: 1_790_000_000, end: 1_790_000_000 + jours * 86_400 } }] } as unknown as Stripe.Invoice["lines"],
  };
}

type RemboursementListe = { payment_intent: string; amount: number; status: string; metadata: Record<string, string> };

function doublure(o: { statut?: string; intervalle?: "month" | "year"; payees?: Facture[]; ouvertes?: string[]; remboursements?: RemboursementListe[] } = {}) {
  const deja = new Set<string>();
  const appels = {
    cancel: vi.fn(async () => ({})),
    update: vi.fn(async () => ({})),
    voidInvoice: vi.fn(async () => ({})),
    refunds: [] as { params: Record<string, unknown>; cle: string }[],
    list: vi.fn(),
  };
  const stripe = {
    subscriptions: {
      retrieve: vi.fn(async () => ({
        id: "sub_1",
        status: o.statut ?? "active",
        schedule: null,
        metadata: {},
        items: { data: [{ id: "si_1", price: { recurring: { interval: o.intervalle ?? "month" } } }] },
      })),
      cancel: appels.cancel,
      update: appels.update,
    },
    invoices: {
      list: appels.list.mockImplementation(async (p: { status: string; created?: { gte: number } }) => ({
        data: p.status === "open" ? (o.ouvertes ?? []).map((id) => ({ id })) : (o.payees ?? []),
      })),
      voidInvoice: appels.voidInvoice,
    },
    refunds: {
      create: vi.fn(async (params: Record<string, unknown>, opts: { idempotencyKey: string }) => {
        const cible = String(params.payment_intent ?? params.charge);
        if (deja.has(cible)) throw Object.assign(new Error("déjà remboursé"), { code: "charge_already_refunded" });
        deja.add(cible);
        appels.refunds.push({ params, cle: opts.idempotencyKey });
        const f = (o.payees ?? []).find((x) => (x.payments?.data?.[0]?.payment as { payment_intent?: string } | undefined)?.payment_intent === cible);
        return { id: `re_${cible}`, amount: f?.amount_paid ?? 0 };
      }),
      list: vi.fn(async (p: { payment_intent?: string }) => ({ data: (o.remboursements ?? []).filter((r) => r.payment_intent === p.payment_intent) })),
    },
  };
  return { stripe: stripe as unknown as Stripe, appels };
}

beforeEach(() => vi.clearAllMocks());

describe("R01 — la rétractation de l'abonnement chez Stripe", () => {
  it("fin immédiate marquée, facture ouverte annulée, chaque paiement remboursé en entier, avec sa clé", async () => {
    const { stripe, appels } = doublure({ payees: [facture("in_1", 599, "pi_1"), facture("in_2", 599, "pi_2")], ouvertes: ["in_3"] });
    const r = await retracterSouscription(stripe, { subscription: "sub_1", cle: "retractation-abonnement-sub_1" });
    expect(appels.cancel).toHaveBeenCalledWith(
      "sub_1",
      expect.objectContaining({ cancellation_details: { comment: COMMENTAIRE_RETRACTATION }, prorate: false }),
      { idempotencyKey: "retractation-abonnement-sub_1-fin" }
    );
    expect(appels.voidInvoice).toHaveBeenCalledWith("in_3", {}, { idempotencyKey: "retractation-abonnement-sub_1-annulation-in_3" });
    expect(r.montantCents).toBe(1198);
    expect(appels.refunds.map((x) => x.cle)).toEqual(["retractation-abonnement-sub_1-in_1-0", "retractation-abonnement-sub_1-in_2-0"]);
    expect(appels.refunds[0].params).toMatchObject({ payment_intent: "pi_1", reason: "requested_by_customer" });
  });

  it("rejouée : la souscription déjà close n'est pas re-close, un remboursement déjà fait est reconnu et pas refait", async () => {
    const payees = [facture("in_1", 599, "pi_1")];
    const { stripe, appels } = doublure({ payees });
    await retracterSouscription(stripe, { subscription: "sub_1", cle: "k" });
    const second = doublure({
      statut: "canceled",
      payees,
      remboursements: [{ payment_intent: "pi_1", amount: 599, status: "succeeded", metadata: { gerimmo_retractation: "k" } }],
    });
    // Le même remboursement, une seconde fois : Stripe répond « déjà remboursé ».
    (second.stripe.refunds.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(Object.assign(new Error("x"), { code: "charge_already_refunded" }));
    const r = await retracterSouscription(second.stripe, { subscription: "sub_1", cle: "k" });
    expect(second.appels.cancel).not.toHaveBeenCalled();
    expect(r).toEqual({ montantCents: 599, refunds: [{ facture: "in_1", refund: null, montant_cents: 599, deja: true }] });
    expect(appels.refunds).toHaveLength(1);
  });

  it("une facture à zéro (essai) n'appelle aucun remboursement ; un paiement introuvable arrête tout", async () => {
    const { stripe, appels } = doublure({ payees: [facture("in_0", 0, null)] });
    expect(await retracterSouscription(stripe, { subscription: "sub_1", cle: "k" })).toEqual({ montantCents: 0, refunds: [] });
    expect(appels.refunds).toHaveLength(0);
    await expect(rembourserFactures(stripe, [facture("in_9", 599, null) as Stripe.Invoice], "k")).rejects.toThrow(/Paiement introuvable/);
  });
});

describe("R37 — la rétractation du passage à l'annuel chez Stripe", () => {
  const base = {
    subscription: "sub_1",
    cle: "retractation-passage-sub_1-1793000000",
    orgId: "org-1",
    offreMensuelle: offreParticulier(1, "mensuel"),
    regime: { nature: "franchise" } as const,
    demandeLe: new Date("2026-11-02T09:00:00Z"),
    choix: "auto" as const,
  };

  it("encore programmé : l'échéancier est libéré, rien n'est remboursé ni modifié", async () => {
    const { stripe, appels } = doublure({ intervalle: "month" });
    const r = await retracterPassageAnnuel(stripe, base);
    expect(r).toEqual({ montantCents: 0, refunds: [], passageEffectue: false });
    expect(offres.libererEcheancier).toHaveBeenCalledTimes(1);
    expect(appels.update).not.toHaveBeenCalled();
  });

  it("déjà effectué : retour au mensuel sans prorata, seules les échéances annuelles payées depuis la demande sont remboursées", async () => {
    const { stripe, appels } = doublure({ intervalle: "year", payees: [facture("in_an", 5990, "pi_an", 365), facture("in_mois", 599, "pi_mois", 30)] });
    const r = await retracterPassageAnnuel(stripe, base);
    expect(appels.update).toHaveBeenCalledWith(
      "sub_1",
      expect.objectContaining({ proration_behavior: "none", billing_cycle_anchor: "now" }),
      { idempotencyKey: `${base.cle}-mensuel` }
    );
    expect(appels.list).toHaveBeenCalledWith(expect.objectContaining({ subscription: "sub_1", created: { gte: Math.floor(base.demandeLe.getTime() / 1000) } }));
    expect(r).toMatchObject({ montantCents: 5990, passageEffectue: true });
    expect(r.refunds.map((x) => x.facture)).toEqual(["in_an"]);
  });

  it("une facture annuelle se reconnaît à une ligne de plus de 200 jours", () => {
    expect(estFactureAnnuelle(facture("a", 1, null, 365) as Stripe.Invoice)).toBe(true);
    expect(estFactureAnnuelle(facture("m", 1, null, 31) as Stripe.Invoice)).toBe(false);
  });
});

// ── Relecture adverse du 24/10 : la doublure à état ──────────────────────────────────────────────────────────────

describe("relecture adverse du 24/10 — reprises chez un Stripe qui garde son état", () => {
  const DEMANDE = new Date("2026-11-02T09:00:00Z");
  const passage = {
    subscription: "sub_1",
    cle: `retractation-passage-sub_1-${Math.floor(DEMANDE.getTime() / 1000)}`,
    orgId: "org-1",
    offreMensuelle: offreParticulier(1, "mensuel"),
    regime: { nature: "franchise" } as const,
    demandeLe: DEMANDE,
    choix: "auto" as const,
  };

  it("point 1 : passage effectué, remboursement échoué APRÈS le retour au mensuel — le rejeu rembourse l'échéance annuelle, sans refaire le retour", async () => {
    const s = new FauxStripeRetractation({ intervalle: "year", maintenant: Math.floor(Date.UTC(2026, 10, 10) / 1000) });
    s.payer({ id: "in_an", created: Math.floor(Date.UTC(2026, 10, 6) / 1000), amount_paid: 5990, pi: "pi_an", jours: 365 });
    s.echecsRemboursement = 1;
    await expect(retracterPassageAnnuel(s.client(), passage)).rejects.toThrow(/timed out/);
    expect(s.intervalle).toBe("month"); // le retour au mensuel est fait, la mensualité prélevée
    expect(s.rembourseSur("pi_an")).toBe(0);
    const rejeu = await retracterPassageAnnuel(s.client(), passage);
    expect(rejeu).toMatchObject({ montantCents: 5990, passageEffectue: true });
    expect(rejeu.refunds.map((r) => r.facture)).toEqual(["in_an"]);
    expect(s.rembourseSur("pi_an")).toBe(5990);
    expect(s.appels.update).toBe(1); // pas de second retour (ni de seconde mensualité)
    expect(s.rembourseSur("pi_mois_1")).toBe(0); // la mensualité du nouveau cycle n'est pas remboursée
    // Rejoué encore, après les 24 h de la clé : rien de plus, et le montant annoncé reste celui de la rétractation.
    s.oublierCles();
    const encore = await retracterPassageAnnuel(s.client(), passage);
    expect(encore).toMatchObject({ montantCents: 5990, passageEffectue: true });
    expect(s.rembourseSur("pi_an")).toBe(5990);
  });

  it("point 1 : une échéance annuelle restée impayée, annulée par un premier passage, laisse le passage « effectué » au rejeu (rien à rembourser)", async () => {
    const s = new FauxStripeRetractation({ intervalle: "year", maintenant: Math.floor(Date.UTC(2026, 10, 10) / 1000) });
    s.payer({ id: "in_an", created: Math.floor(Date.UTC(2026, 10, 6) / 1000), amount_paid: 5990, pi: "pi_an", jours: 365, status: "open" });
    const premier = await retracterPassageAnnuel(s.client(), passage);
    expect(premier).toMatchObject({ montantCents: 0, passageEffectue: true });
    expect(s.factures.find((f) => f.id === "in_an")?.status).toBe("void");
    const rejeu = await retracterPassageAnnuel(s.client(), passage);
    expect(rejeu).toMatchObject({ montantCents: 0, passageEffectue: true });
  });

  it("point 1 : un passage encore programmé (aucune échéance annuelle émise) reste « non effectué »", async () => {
    const s = new FauxStripeRetractation({ intervalle: "month", maintenant: Math.floor(Date.UTC(2026, 10, 10) / 1000) });
    s.payer({ id: "in_mois", created: Math.floor(Date.UTC(2026, 10, 5) / 1000), amount_paid: 599, pi: "pi_m", jours: 30 });
    expect(await retracterPassageAnnuel(s.client(), passage)).toEqual({ montantCents: 0, refunds: [], passageEffectue: false });
    expect(s.appels.update).toBe(0);
  });

  it("point 6 : rejeu après 24 h avec un geste commercial antérieur — le montant annoncé est celui que la rétractation a remboursé", async () => {
    const s = new FauxStripeRetractation({ intervalle: "month", maintenant: 10 });
    s.payer({ id: "in_1", created: 1, amount_paid: 599, pi: "pi_1", jours: 30 });
    s.rembourserHors("pi_1", 100);
    const cle = "retractation-abonnement-sub_1";
    const r1 = await retracterSouscription(s.client(), { subscription: "sub_1", cle });
    s.oublierCles();
    const r2 = await retracterSouscription(s.client(), { subscription: "sub_1", cle });
    expect([r1.montantCents, r2.montantCents]).toEqual([499, 499]);
    expect(r2.refunds).toEqual([{ facture: "in_1", refund: null, montant_cents: 499, deja: true }]);
  });

  it("R01 : échec partiel, rejeu de moins de 24 h, rejeu de plus de 24 h — chaque paiement remboursé une fois", async () => {
    const s = new FauxStripeRetractation({ intervalle: "month", maintenant: Math.floor(Date.UTC(2026, 10, 10) / 1000) });
    s.payer({ id: "in_1", created: 1, amount_paid: 599, pi: "pi_1", jours: 30 });
    s.payer({ id: "in_2", created: 2, amount_paid: 300, pi: "pi_2", jours: 20 });
    s.echecsRemboursement = 1;
    const cle = "retractation-abonnement-sub_1";
    await expect(retracterSouscription(s.client(), { subscription: "sub_1", cle })).rejects.toThrow();
    const r2 = await retracterSouscription(s.client(), { subscription: "sub_1", cle });
    const r3 = await retracterSouscription(s.client(), { subscription: "sub_1", cle });
    s.oublierCles();
    const r4 = await retracterSouscription(s.client(), { subscription: "sub_1", cle });
    expect([r2.montantCents, r3.montantCents, r4.montantCents]).toEqual([899, 899, 899]);
    expect([s.rembourseSur("pi_1"), s.rembourseSur("pi_2")]).toEqual([599, 300]);
    expect(s.appels.cancel).toBe(1);
  });
});
