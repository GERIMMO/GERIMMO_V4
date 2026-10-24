/**
 * Les courriers du contrat déclenchés par le webhook Stripe (plan de conformité du 23/10/2026), sans Stripe, base ni
 * prestataire d'e-mail réels :
 *  · R03 : la confirmation part à la naissance de la souscription, une fois, avec le PDF de la version acceptée (ou son
 *    adresse et une trace), même sans médiateur saisi ; la souscription est datée ;
 *  · R04 : une résiliation notifiée hors de la page reçoit l'accusé, une fois (même clé que l'action) ;
 *  · R07 : sur `customer.subscription.deleted`, le courrier de résiliation pour impayé et l'annulation de la facture
 *    ouverte, SEULEMENT si un défaut était en cours et qu'aucune résiliation n'avait été demandée (ni rétractation) ;
 *  · aucun courrier ne fait échouer le webhook.
 *
 * Relectures adverses du 24/10 : la confirmation part aussi quand la souscription devient active après être née
 * « incomplete » (I5) ; une résiliation levée hors de la page efface la marque de son accusé (I3) ; le courrier de
 * résiliation pour impayé ne cite l'article 15 que si trente jours ont passé depuis la mise en demeure, sinon un texte
 * neutre et une alerte au relais (I1).
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
  resiliation_par_la_page?: boolean;
};

function banc(avant: Avant, options: { archivee?: boolean; texteArchive?: string; resiliationsAccusees?: number } = {}) {
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
    resiliations_accusees: options.resiliationsAccusees ?? (avant.resiliation_accusee_pour ? 1 : 0),
  };
  const requete = (table: string) => {
    const q: Record<string, unknown> = {};
    const fin = async () =>
      table === "versions_conditions"
        ? { data: options.archivee ? { document: "conditions_clients", version: "2026-09-30", texte_html: options.texteArchive ?? "<p>Texte</p>", publiee_le: "2026-10-24T10:00:00Z", empreinte_sha256: "a".repeat(64), date_effet: "2026-09-30", nature: "substantielle", resume_modifications: "x" } : null, error: null }
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
/** Une souscription déjà confirmée (I5 : une mise à jour d'une souscription récente non confirmée enverrait la confirmation). */
const CONFIRMEE: Avant = { ...RIEN, confirmation_envoyee_le: "2026-10-26T09:01:00Z" };

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

  it("intégration avec le socle (M1) : un texte rangé hors de la liste blanche du balisage n'est pas rendu en PDF", async () => {
    const s = souscription({});
    const { supabase, traces } = banc(RIEN, { archivee: true, texteArchive: '<p>Texte</p><img src="x" onerror="alert(1)">' });
    await traiterEvenementStripe(supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.created", s));
    expect(m.envois).toHaveLength(1);
    expect(m.envois[0].piecesJointes).toBeUndefined();
    expect(m.envois[0].html).toContain("https://gerimmo.example.invalid/conditions");
    expect(traces).toContainEqual(expect.objectContaining({ evenement: "confirmation_sans_pdf" }));
  });

  it("une version non archivée : l'adresse des conditions et une trace au journal technique", async () => {
    const s = souscription({});
    const { supabase, traces } = banc(RIEN);
    await traiterEvenementStripe(supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.created", s));
    expect(m.envois[0].piecesJointes).toBeUndefined();
    expect(m.envois[0].html).toContain("https://gerimmo.example.invalid/conditions");
    expect(traces).toContainEqual(expect.objectContaining({ evenement: "confirmation_sans_pdf" }));
  });

  it("I5 : née « incomplete » (authentification forte), puis active — la confirmation part à la bascule, une fois", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-26T09:10:00Z"), toFake: ["Date"] });
    try {
      const incomplete = souscription({ status: "incomplete" });
      await traiterEvenementStripe(banc(RIEN).supabase as never, stripeFictif(incomplete).stripe, evenement("customer.subscription.created", incomplete));
      expect(m.envois).toHaveLength(0);
      const active = souscription({ status: "active" });
      const { supabase, appels } = banc(RIEN);
      await traiterEvenementStripe(supabase as never, stripeFictif(active).stripe, evenement("customer.subscription.updated", active));
      expect(m.envois).toHaveLength(1);
      expect(m.envois[0]).toMatchObject({ subject: "Confirmation de votre abonnement Gerimmo", cleIdempotence: "souscription-sub_1" });
      expect(appels.some((a) => a.nom === "abonnement_confirmation_envoyee")).toBe(true);
      // Déjà confirmée : une mise à jour ne renvoie rien.
      await traiterEvenementStripe(banc({ ...RIEN, confirmation_envoyee_le: "2026-10-26T09:05:00Z" }).supabase as never, stripeFictif(active).stripe, evenement("customer.subscription.updated", active));
      expect(m.envois).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("I5 : une souscription ancienne (plus d'un mois) qui n'a jamais été confirmée n'en reçoit pas à sa prochaine mise à jour", async () => {
    vi.useFakeTimers({ now: new Date("2027-01-15T09:00:00Z"), toFake: ["Date"] });
    try {
      const active = souscription({ status: "active" });
      await traiterEvenementStripe(banc(RIEN).supabase as never, stripeFictif(active).stripe, evenement("customer.subscription.updated", active));
      expect(m.envois).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
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
    const { supabase, appels } = banc(CONFIRMEE);
    await traiterEvenementStripe(supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.updated", s));
    expect(m.envois).toHaveLength(1);
    expect(m.envois[0]).toMatchObject({ subject: "Votre résiliation Gerimmo est enregistrée", cleIdempotence: "resiliation-sub_1-2026-11-26" });
    expect(m.envois[0].html).toContain("3 novembre 2026 à 14 h 05");
    expect(appels.find((a) => a.nom === "abonnement_resiliation_accusee")?.args).toMatchObject({ p_chemin: "webhook", p_periode_fin: "2026-11-26T09:00:00.000Z" });
  });

  it("déjà demandée avant l'événement, ou déjà accusée pour cette échéance : aucun second accusé", async () => {
    const s = souscription({ cancel_at_period_end: true });
    await traiterEvenementStripe(banc({ ...CONFIRMEE, annulation_demandee: true }).supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.updated", s));
    await traiterEvenementStripe(banc({ ...CONFIRMEE, resiliation_accusee_pour: "2026-11-26T09:00:00Z" }).supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.updated", s));
    expect(m.envois).toHaveLength(0);
  });

  it("I3 : une résiliation levée (hors de la page) efface la marque de l'accusé ; la suivante est accusée sous une clé de rang", async () => {
    const levee = souscription({ cancel_at_period_end: false });
    const { supabase, appels } = banc({ ...CONFIRMEE, annulation_demandee: true, resiliation_accusee_pour: "2026-11-26T09:00:00Z" });
    await traiterEvenementStripe(supabase as never, stripeFictif(levee).stripe, evenement("customer.subscription.updated", levee));
    expect(appels.find((a) => a.nom === "abonnement_resiliation_levee")?.args).toEqual({ p_org: "org-1", p_subscription: "sub_1" });
    expect(m.envois).toHaveLength(0);
    // La notification suivante : la marque effacée, un accusé déjà envoyé pour cette souscription → clé de rang 2.
    const s = souscription({ cancel_at_period_end: true });
    await traiterEvenementStripe(banc(CONFIRMEE, { resiliationsAccusees: 1 }).supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.updated", s));
    expect(m.envois.map((e) => e.cleIdempotence)).toEqual(["resiliation-sub_1-2026-11-26-2"]);
  });

  it("notifiée à l'instant par la page « Résilier votre contrat » : la page envoie l'accusé, pas le webhook", async () => {
    const s = souscription({ cancel_at_period_end: true });
    await traiterEvenementStripe(banc({ ...CONFIRMEE, resiliation_par_la_page: true }).supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.updated", s));
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

  it("I1 : résiliée AVANT trente jours de mise en demeure (réglage Stripe à corriger) — texte neutre, sans article 15, et alerte au relais", async () => {
    vi.stubEnv("GERIMMO_RELAIS_EMAILS", "relais@example.invalid");
    const s = souscription({ status: "canceled", ended_at: Date.parse("2026-10-18T13:00:00Z") / 1000 } as Partial<Stripe.Subscription>);
    const { stripe, annulees } = stripeFictif(s, ["in_1"]);
    const { supabase, traces } = banc(ENDEFAUT); // défaut le 4/10, résiliée le 18/10 : J+14
    await traiterEvenementStripe(supabase as never, stripe, evenement("customer.subscription.deleted", s));
    expect(annulees).toEqual(["in_1"]);
    const client = m.envois.find((e) => e.to === "titulaire@example.invalid")!;
    expect(client.html).not.toContain("article 15");
    expect(client.html).toContain("Faute de règlement, votre abonnement Gerimmo a été résilié le 18 octobre 2026.");
    expect(client.html).toContain("La facture restée impayée est annulée.");
    expect(traces).toContainEqual(expect.objectContaining({ evenement: "resiliation_impaye_avant_mise_en_demeure" }));
    const alerte = m.envois.find((e) => e.to === "relais@example.invalid")!;
    expect(alerte.subject).toMatch(/résiliation pour impayé avant/i);
    expect(alerte.html).not.toContain("titulaire@example.invalid");
  });

  it("I1 : à J+30 ou après, l'article 15.4 est cité (la mise en demeure est restée sans effet trente jours)", async () => {
    const s = souscription({ status: "canceled", ended_at: Date.parse("2026-11-03T13:00:00Z") / 1000 } as Partial<Stripe.Subscription>);
    await traiterEvenementStripe(banc(ENDEFAUT).supabase as never, stripeFictif(s, ["in_1"]).stripe, evenement("customer.subscription.deleted", s));
    expect(m.envois[0].html).toContain("est résilié depuis le 3 novembre 2026, en application de l'article 15.4 des conditions générales.");
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

// Finitions du 24/10 (relectures transverses 1 et 3 : I1, I4, M1) : une date d'arrêt (`cancel_at`) est une fin
// programmée ; la fin posée par la fermeture d'un compte, ou par la non-reconduction faute d'accord, n'est ni une
// résiliation notifiée par le client (pas d'accusé) ni une résiliation pour impayé (pas de courrier, facture laissée).
describe("finitions du 24/10 : fermeture de compte et non-reconduction vues du webhook", () => {
  it("I1 : une date d'arrêt (fermeture à quatorze jours) est inscrite comme une fin programmée", async () => {
    const s = souscription({ cancel_at: Date.parse("2026-11-07T23:00:00Z") / 1000, metadata: { gerimmo_grille: "2026-09-28", gerimmo_formule: "solo", gerimmo_unites: "1", gerimmo_fermeture: "programmee" } } as Partial<Stripe.Subscription>);
    const { supabase, appels } = banc(CONFIRMEE);
    await traiterEvenementStripe(supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.updated", s));
    expect(appels.find((a) => a.nom === "abonnement_appliquer")?.args).toMatchObject({ p_annulation: true });
    expect(m.envois).toHaveLength(0);
  });

  it("I4 et M1 : une fin de période posée par la fermeture n'envoie pas d'accusé de résiliation", async () => {
    const s = souscription({ cancel_at_period_end: true, metadata: { gerimmo_grille: "2026-09-28", gerimmo_formule: "solo", gerimmo_unites: "1", gerimmo_fermeture: "programmee" } } as Partial<Stripe.Subscription>);
    const { supabase, appels } = banc(CONFIRMEE);
    await traiterEvenementStripe(supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.updated", s));
    expect(m.envois).toHaveLength(0);
    expect(appels.some((a) => a.nom === "abonnement_resiliation_accusee")).toBe(false);
    // Marque retirée (fermeture annulée) : une résiliation ensuite notifiée hors de la page est accusée comme avant.
    const ensuite = souscription({ cancel_at_period_end: true, metadata: { gerimmo_grille: "2026-09-28", gerimmo_formule: "solo", gerimmo_unites: "1", gerimmo_fermeture: "" } } as Partial<Stripe.Subscription>);
    await traiterEvenementStripe(banc(CONFIRMEE).supabase as never, stripeFictif(ensuite).stripe, evenement("customer.subscription.updated", ensuite));
    expect(m.envois.map((e) => e.subject)).toEqual(["Votre résiliation Gerimmo est enregistrée"]);
  });

  it("M1 (relecture 3) : la non-reconduction faute d'accord n'envoie pas d'accusé d'une résiliation que le client n'a pas notifiée", async () => {
    const s = souscription({ cancel_at_period_end: true, metadata: { gerimmo_grille: "2026-09-28", gerimmo_formule: "solo", gerimmo_unites: "1", gerimmo_non_reconduction: "2026-12-01" } } as Partial<Stripe.Subscription>);
    await traiterEvenementStripe(banc(CONFIRMEE).supabase as never, stripeFictif(s).stripe, evenement("customer.subscription.updated", s));
    expect(m.envois).toHaveLength(0);
  });

  it("I1 : un compte en impayé fermé à quatorze jours ne reçoit pas « résilié faute de règlement », et sa facture n'est pas annulée", async () => {
    // Essai s7 de la relecture transverse 1.
    const arret = Date.parse("2026-11-07T23:00:00Z") / 1000;
    const s = souscription({ status: "canceled", cancel_at: arret, ended_at: arret, metadata: { gerimmo_grille: "2026-09-28", gerimmo_formule: "solo", gerimmo_unites: "1", gerimmo_fermeture: "programmee" },
      cancellation_details: { reason: "cancellation_requested", comment: null, feedback: null } } as unknown as Partial<Stripe.Subscription>);
    const { stripe, annulees } = stripeFictif(s, ["in_impayee"]);
    await traiterEvenementStripe(banc({ ...RIEN, paiement_en_defaut_depuis: "2026-10-04" }).supabase as never, stripe, evenement("customer.subscription.deleted", s));
    expect(annulees).toEqual([]);
    expect(m.envois).toHaveLength(0);
  });

  it("I1 : la levée efface la marque de l'accusé seulement si plus aucune fin n'est programmée (ni échéance, ni date d'arrêt)", async () => {
    const arret = souscription({ cancel_at_period_end: false, cancel_at: Date.parse("2026-11-07T23:00:00Z") / 1000 } as Partial<Stripe.Subscription>);
    const { supabase, appels } = banc({ ...CONFIRMEE, annulation_demandee: true, resiliation_accusee_pour: "2026-11-26T09:00:00Z" });
    await traiterEvenementStripe(supabase as never, stripeFictif(arret).stripe, evenement("customer.subscription.updated", arret));
    expect(appels.some((a) => a.nom === "abonnement_resiliation_levee")).toBe(false);
  });
});
