/**
 * Les courriers du contrat déclenchés par le webhook Stripe (plan de conformité du 23/10/2026), sans Stripe, base ni
 * prestataire d'e-mail réels :
 *  · R03 : la confirmation part à la naissance de la souscription, une fois, avec le PDF de la version acceptée (ou son
 *    adresse et une trace), même sans médiateur saisi ; la souscription est datée ;
 *  · R04 : une résiliation notifiée hors de la page reçoit l'accusé, une fois (même clé que l'action) ;
 *  · R07 : sur `customer.subscription.deleted`, le courrier de résiliation pour impayé et l'annulation de la facture
 *    ouverte, SEULEMENT si un défaut était en cours et qu'aucune résiliation n'avait été demandée (ni rétractation) ;
 *  · aucun courrier ne fait échouer le webhook.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const m = vi.hoisted(() => ({ envois: [] as { to: string; subject: string; html: string; cleIdempotence?: string; piecesJointes?: unknown[] }[], echec: null as string | null }));
vi.mock("@/lib/email", () => ({
  envoyerEmail: async (p: { to: string; subject: string; html: string; cleIdempotence?: string; piecesJointes?: unknown[] }) => {
    if (m.echec) return { erreur: m.echec };
    m.envois.push(p);
    return { id: `message-${m.envois.length}` };
  },
}));
vi.mock("@/lib/relances-paiement", () => ({ envoyerRelancesDues: async () => ({ envoyees: 0, sans_adresse: [], echecs: [] }) }));
// Le rendu Chromium est remplacé par un PDF fictif (« %PDF ») : le test porte sur la pièce jointe, pas sur le rendu.
vi.mock("@/lib/documents/rendu", () => ({ rendrePdf: async () => new Uint8Array([37, 80, 68, 70]) }));

import { traiterEvenementStripe } from "@/lib/stripe-evenements";

type Avant = {
  stripe_subscription_id: string | null;
  annulation_demandee: boolean;
  paiement_en_defaut_depuis: string | null;
  resiliation_impaye_notifiee_le: string | null;
  confirmation_envoyee_le?: string | null;
  resiliation_accusee_pour?: string | null;
};

function banc(avant: Avant, options: { archivee?: boolean } = {}) {
  const appels: { nom: string; args: Record<string, unknown> }[] = [];
  const traces: Record<string, unknown>[] = [];
  const contexte = {
    organization_id: "org-1",
    organisation: "Espace fictif",
    public_tarif: "proprietaire_direct",
    grille: "2026-09-28",
    destinataire: "titulaire@example.invalid",
    nom_titulaire: "Camille Exemple",
    stripe_subscription_id: "sub_1",
    stripe_statut: "active",
    souscrit_le: "2026-10-26T09:00:00Z",
    periode_fin: "2026-11-26T09:00:00Z",
    essai_fin: null,
    formule: "solo",
    unites_souscrites: 1,
    periodicite: "mensuel",
    montant_periode_cents: 599,
    confirmation_envoyee_le: avant.confirmation_envoyee_le ?? null,
    resiliation_accusee_pour: avant.resiliation_accusee_pour ?? null,
    cgu_version: "2026-09-30",
    cgu_acceptee_le: "2026-10-26T08:55:00Z",
  };
  const requete = (table: string) => {
    const q: Record<string, unknown> = {};
    const fin = async () =>
      table === "versions_conditions"
        ? { data: options.archivee ? { document: "conditions_clients", version: "2026-09-30", texte_html: "<p>Texte</p>", publiee_le: "2026-10-24T10:00:00Z", empreinte_sha256: "a".repeat(64), date_effet: "2026-09-30", nature: "substantielle", resume_modifications: "x" } : null, error: null }
        : table === "organizations"
          ? { data: { type: "proprietaire_direct" }, error: null }
          : { data: { valeurs: {} }, error: null };
    Object.assign(q, { select: () => q, eq: () => q, maybeSingle: fin, insert: async (v: Record<string, unknown>) => { traces.push(v); return { error: null }; } });
    return q;
  };
  const supabase = {
    from: requete,
    rpc: async (nom: string, args: Record<string, unknown>) => {
      appels.push({ nom, args });
      if (nom === "abonnement_par_client")
        return { data: [{ organization_id: "org-1", organisation: "Espace fictif", public_tarif: "proprietaire_direct", grille: "2026-09-28", stripe_subscription_id: "sub_1", stripe_statut: "active", destinataire: "titulaire@example.invalid" }], error: null };
      if (nom === "abonnement_contexte_evenement") return { data: [{ organization_id: "org-1", stripe_statut: "active", periode_fin: null, souscrit_le: null, confirmation_envoyee_le: null, resiliation_accusee_pour: null, ...avant }], error: null };
      if (nom === "abonnement_appliquer") return { data: "org-1", error: null };
      if (nom === "abonnement_courrier_contexte") return { data: [contexte], error: null };
      return { data: true, error: null };
    },
  };
  return { supabase, appels, traces };
}

function souscription(s: Partial<Stripe.Subscription> & { id?: string }): Stripe.Subscription {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    start_date: Date.parse("2026-10-26T09:00:00Z") / 1000,
    trial_end: null,
    cancel_at_period_end: false,
    metadata: { gerimmo_grille: "2026-09-28", gerimmo_formule: "solo", gerimmo_unites: "1" },
    items: { data: [{ current_period_end: Date.parse("2026-11-26T09:00:00Z") / 1000, quantity: 1, price: { unit_amount: 599, recurring: { interval: "month" } } }] },
    ...s,
  } as unknown as Stripe.Subscription;
}

function stripeFictif(s: Stripe.Subscription, factures: string[] = []) {
  const annulees: string[] = [];
  const stripe = {
    subscriptions: { retrieve: async () => s },
    customers: { retrieve: async () => ({ id: "cus_1", invoice_settings: { footer: "TVA non applicable, art. 293 B du CGI." } }), update: async () => ({}) },
    invoices: {
      list: async () => ({ data: factures.map((id) => ({ id })) }),
      voidInvoice: async (id: string) => {
        annulees.push(id);
        return { id, status: "void" };
      },
    },
  };
  return { stripe: stripe as unknown as Stripe, annulees };
}

const evenement = (type: string, s: Stripe.Subscription): Stripe.Event =>
  ({ id: `evt_${type}`, type, created: Date.parse("2026-11-03T13:05:00Z") / 1000, data: { object: s } }) as unknown as Stripe.Event;

const RIEN: Avant = { stripe_subscription_id: "sub_1", annulation_demandee: false, paiement_en_defaut_depuis: null, resiliation_impaye_notifiee_le: null };

beforeEach(() => {
  m.envois.length = 0;
  m.echec = null;
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://gerimmo.example.invalid");
});

describe("R03 — la confirmation de la souscription", () => {
  it("part à la naissance, une fois (clé souscription-{sub}), datée et marquée ; sans médiateur saisi aussi", async () => {
    const s = souscription({});
    const { supabase, appels } = banc(RIEN);
    const r = await traiterEvenementStripe(supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.created", s));
    expect(appels.find((a) => a.nom === "abonnement_souscription_datee")?.args).toEqual({ p_customer: "cus_1", p_subscription: "sub_1", p_souscrit_le: "2026-10-26T09:00:00.000Z" });
    expect(m.envois).toHaveLength(1);
    expect(m.envois[0]).toMatchObject({ to: "titulaire@example.invalid", subject: "Confirmation de votre abonnement Gerimmo", cleIdempotence: "souscription-sub_1" });
    expect(m.envois[0].html).toContain("adhésion en cours");
    expect(appels.find((a) => a.nom === "abonnement_confirmation_envoyee")?.args).toMatchObject({ p_org: "org-1", p_subscription: "sub_1", p_message: "message-1" });
    expect((r.reponse as { courriers?: Record<string, unknown> }).courriers).toEqual({ confirmation: "envoye" });
  });

  it("version archivée : le PDF de la version acceptée est joint", async () => {
    const s = souscription({});
    const { supabase, appels, traces } = banc(RIEN, { archivee: true });
    await traiterEvenementStripe(supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.created", s));
    expect(m.envois).toHaveLength(1);
    expect(m.envois[0].piecesJointes).toEqual([{ nom: "conditions-generales-2026-09-30.pdf", contenuBase64: Buffer.from("%PDF").toString("base64") }]);
    expect(m.envois[0].html).toContain("sont jointes au format PDF");
    expect(appels.find((a) => a.nom === "abonnement_confirmation_envoyee")?.args).toMatchObject({ p_piece_jointe: true });
    expect(traces).toEqual([]);
  });

  it("une version non archivée : l'adresse des conditions et une trace au journal technique", async () => {
    const s = souscription({});
    const { supabase, traces } = banc(RIEN);
    await traiterEvenementStripe(supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.created", s));
    expect(m.envois[0].piecesJointes).toBeUndefined();
    expect(m.envois[0].html).toContain("https://gerimmo.example.invalid/conditions");
    expect(traces).toContainEqual(expect.objectContaining({ evenement: "confirmation_sans_pdf" }));
  });

  it("déjà envoyée : rien ne repart ; un envoi en échec ne fait pas échouer le webhook", async () => {
    const s = souscription({});
    await traiterEvenementStripe(banc({ ...RIEN, confirmation_envoyee_le: "2026-10-26T09:01:00Z" }).supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.created", s));
    expect(m.envois).toHaveLength(0);
    m.echec = "Le service d’e-mail a refusé l’envoi.";
    const r = await traiterEvenementStripe(banc(RIEN).supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.created", s));
    expect((r.reponse as { courriers?: Record<string, unknown> }).courriers).toEqual({ confirmation: { motif: "Le service d’e-mail a refusé l’envoi." } });
  });
});

describe("R04 — l'accusé d'une résiliation notifiée hors de la page", () => {
  it("la bascule vers « résiliation demandée » envoie l'accusé, sous la clé partagée avec l'action", async () => {
    const s = souscription({ cancel_at_period_end: true });
    const { supabase, appels } = banc(RIEN);
    await traiterEvenementStripe(supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.updated", s));
    expect(m.envois).toHaveLength(1);
    expect(m.envois[0]).toMatchObject({ subject: "Votre résiliation Gerimmo est enregistrée", cleIdempotence: "resiliation-sub_1-2026-11-26" });
    expect(m.envois[0].html).toContain("3 novembre 2026 à 14 h 05");
    expect(appels.find((a) => a.nom === "abonnement_resiliation_accusee")?.args).toMatchObject({ p_chemin: "webhook", p_periode_fin: "2026-11-26T09:00:00.000Z" });
  });

  it("déjà demandée avant l'événement, ou déjà accusée pour cette échéance : aucun second accusé", async () => {
    const s = souscription({ cancel_at_period_end: true });
    await traiterEvenementStripe(banc({ ...RIEN, annulation_demandee: true }).supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.updated", s));
    await traiterEvenementStripe(banc({ ...RIEN, resiliation_accusee_pour: "2026-11-26T09:00:00Z" }).supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.updated", s));
    expect(m.envois).toHaveLength(0);
  });
});

describe("R07 — la résiliation pour impayé", () => {
  const ENDEFAUT: Avant = { ...RIEN, paiement_en_defaut_depuis: "2026-10-04" };

  it("défaut en cours, aucune résiliation demandée : facture ouverte annulée, courrier envoyé et marqué", async () => {
    const s = souscription({ status: "canceled", ended_at: Date.parse("2026-11-03T13:00:00Z") / 1000 } as Partial<Stripe.Subscription>);
    const { stripe, annulees } = stripeFictif(s, ["in_1"]);
    const { supabase, appels } = banc(ENDEFAUT);
    await traiterEvenementStripe(supabase as never, stripe, evenement("customer.subscription.deleted", s));
    expect(annulees).toEqual(["in_1"]);
    expect(m.envois).toHaveLength(1);
    expect(m.envois[0]).toMatchObject({ subject: "Votre abonnement Gerimmo est résilié faute de règlement", cleIdempotence: "resiliation-impaye-sub_1" });
    expect(m.envois[0].html).toContain("La facture restée impayée est annulée.");
    expect(appels.find((a) => a.nom === "abonnement_resiliation_impaye_notifiee")?.args).toMatchObject({ p_factures_annulees: ["in_1"] });
  });

  it("seulement dans le cas prévu : pas sans défaut, pas après une résiliation demandée, pas pour une rétractation, pas deux fois", async () => {
    const s = souscription({ status: "canceled" });
    for (const avant of [RIEN, { ...ENDEFAUT, annulation_demandee: true }, { ...ENDEFAUT, resiliation_impaye_notifiee_le: "2026-11-03T13:00:00Z" }]) {
      await traiterEvenementStripe(banc(avant).supabase as never, stripeFictif(s, ["in_1"]).stripe, evenement("customer.subscription.deleted", s));
    }
    const retractee = souscription({ status: "canceled", cancellation_details: { comment: "gerimmo:retractation", feedback: null, reason: "cancellation_requested" } } as Partial<Stripe.Subscription>);
    await traiterEvenementStripe(banc(ENDEFAUT).supabase as never, stripeFictif(retractee, ["in_1"]).stripe, evenement("customer.subscription.deleted", retractee));
    expect(m.envois).toHaveLength(0);
  });
});
