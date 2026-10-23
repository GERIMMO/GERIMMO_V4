/**
 * Défauts A01 et A02 de la facturation (audit du 23/10/2026, P1), au niveau des actions « Mon abonnement ».
 *
 * Ni Stripe ni base réels : un faux Stripe qui GARDE SON ÉTAT (pages de paiement, clés d'idempotence, souscription,
 * échéanciers) et un faux registre qui reprend la sémantique des fonctions SQL de la migration
 * 20261023162446_souscription_unique_et_trace_hausse.sql (une seule intention « en_cours » par organisation, prise sous
 * verrou ; la page expirée ou la préparation interrompue libèrent la place). La sémantique réelle de ces fonctions
 * (verrou, index unique partiel, droits, RLS, rejeu, retour) est éprouvée sur Postgres dans
 * tests/intention-souscription-base.test.ts.
 *
 *  A01 — deux demandes de souscription quasi simultanées (deux onglets) passaient toutes deux le contrôle « abonnement
 *        ou page déjà ouverts » et ouvraient deux pages de paiement utilisables. Attendu : UNE page, la même adresse
 *        pour les deux onglets, une expiration posée, une clé d'idempotence dérivée de la réservation ; une page déjà
 *        ouverte est réutilisée ; une autre formule ferme l'ancienne page avant d'en ouvrir une nouvelle.
 *  A02 — une hausse demandée alors qu'un échéancier (baisse ou périodicité programmée) est en place : l'échéancier est
 *        libéré avant la hausse ; si le paiement échoue, il restait retiré et l'écran disait « rien n'a été modifié ».
 *        Attendu : l'échéancier est recréé à l'identique ; si la recréation échoue elle-même, la phrase dit exactement
 *        ce qui s'est passé et l'échéance est marquée à recalculer pour la tâche de nuit.
 *  Relecture adverse du 23/10 : le faux Stripe suit Stripe sur deux points que la version précédente ignorait —
 *        il REFUSE de libérer un échéancier qui n'est plus « active » / « not_started », et la mise à jour de la phase EN
 *        COURS d'un échéancier attaché s'applique à la souscription (prix, métadonnées). Deux confirmations simultanées
 *        de la même hausse (Promise.all), ou une demande de périodicité / une résiliation pendant la hausse, ne doivent
 *        plus défaire la hausse payée ; le verrou des gestes de facturation (verrou_facturation_prendre / _rendre) est
 *        simulé avec la sémantique de la fonction SQL.
 *
 * Aucune adresse réelle : domaine example.invalid.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { libelleActionAudit } from "@/lib/libelles-journaux";
import { offreParticulier } from "@/lib/tarifs";

const PIED = "TVA non applicable, art. 293 B du CGI.";
const ORG = "org-1";

type Session = {
  id: string;
  url: string;
  status: "open" | "expired" | "complete";
  customer: string;
  metadata: Record<string, string>;
  expires_at?: number;
};
type Intention = {
  id: string;
  org: string;
  empreinte: string;
  statut: "en_cours" | "terminee";
  session: string | null;
  url: string | null;
  cree_le: Date;
  expire_le: Date;
  motif: string | null;
};

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  serviceRpc: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  stripe: null as unknown,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "www.gerimmo.test", "x-forwarded-proto": "https" }),
}));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: m.rpc,
    auth: { getUser: async () => ({ data: { user: { id: "compte-1" } }, error: null }) },
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () =>
          table === "acceptations_cgu"
            ? { data: { id: "acceptation-1" }, error: null }
            : { data: { id: ORG, name: "Org", type: "proprietaire_direct", email_contact: null }, error: null },
      };
      return q;
    },
  }),
}));
// L'identité de l'éditeur est complète : la garde elle-même est testée dans garde-souscription.test.ts.
vi.mock("@/lib/editeur-serveur", () => ({
  lireEditeur: async () => ({
    editeur: {
      denomination: "Éditeur de test", forme: "SAS", capital: null, siege: "1 rue de l'Essai, 75000 Paris",
      rcs: "RCS Paris 000 000 000", siret: "00000000000000", tvaIntracommunautaire: null,
      directeurPublication: "Personne de test", email: "contact@example.invalid", telephone: "01 00 00 00 00",
      mediateurNom: "Médiateur de test", mediateurAdresse: "1 rue Exemple, Paris", mediateurSite: "https://example.invalid/mediateur",
    },
    indisponible: false,
  }),
}));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ rpc: m.serviceRpc }) }));
vi.mock("@/lib/stripe", async (importer) => ({
  ...(await importer<typeof import("@/lib/stripe")>()),
  configurationStripe: () => ({ pret: true, config: { cle: "sk_test_x", secretWebhook: "whsec_x", prix: {} } }),
  clientStripe: () => m.stripe,
}));

import { confirmerHausse, demanderPeriodicite, demarrerAbonnement, resilierAbonnement } from "@/app/actions/abonnement";
import { appliquerHausse } from "@/lib/stripe-offres";

/** Une pause réelle (tâche suivante) : deux actions lancées ensemble s'entrelacent à chaque appel « réseau ». */
const tour = () => new Promise<void>((r) => setTimeout(r, 0));

// ── Le faux Stripe, avec état ─────────────────────────────────────────────────────────────────────────────────────
function fauxStripe() {
  const maintenant = Math.floor(Date.now() / 1000);
  const T0 = maintenant - 10 * 86400;
  const T1 = maintenant + 2 * 86400;
  const T2 = T1 + 365 * 86400;
  const etat = {
    sessions: [] as Session[],
    creations: [] as { params: Record<string, unknown>; options?: { idempotencyKey?: string } }[],
    cles: new Map<string, { corps: string; session: Session }>(),
    souscriptionsVivantes: [] as { id: string; status: string }[],
    refusCarte: false,
    echecRecreation: false,
    /** La mise à jour est appliquée chez Stripe, mais sa réponse se perd (erreur 500 rejouée par la clé d'idempotence). */
    majSansReponse: false,
    /** Joué juste avant une libération d'échéancier : un geste d'ailleurs (tableau de bord Stripe, autre onglet). */
    avantLiberation: null as null | (() => void),
    majEcheanciers: [] as { id: string; params: Record<string, unknown> }[],
    echeanciersCrees: [] as string[],
    liberations: [] as string[],
    liberationsRefusees: [] as string[],
    /** Hausses appliquées chez Stripe (mises à jour des lignes de la souscription). */
    hausses: 0,
    T0, T1, T2,
  };
  const phase = (debut: number, fin: number, prix: string, metadata: Record<string, string>) => ({
    start_date: debut,
    end_date: fin,
    items: [{ price: prix, quantity: 1, tax_rates: [], metadata: {}, discounts: [], billing_thresholds: null, plan: prix }],
    metadata,
    trial_end: null,
    proration_behavior: "none",
    add_invoice_items: [],
    discounts: [],
    application_fee_percent: null,
    billing_thresholds: null,
    collection_method: null,
    default_payment_method: null,
    default_tax_rates: [],
    description: null,
    invoice_settings: null,
    on_behalf_of: null,
    transfer_data: null,
    billing_cycle_anchor: null,
    currency: "eur",
  });
  const metaSolo = { gerimmo_formule: "solo", gerimmo_unites: "1", gerimmo_montant_cents: "599", gerimmo_periodicite: "mensuel", gerimmo_choix: "auto", gerimmo_grille: "2026-09-28", organization_id: ORG };
  // L'échéancier programmé par la tâche de nuit : la période en cours, puis le passage à l'annuel à l'échéance.
  const echeancierInitial = {
    id: "sub_sched_1",
    status: "active",
    end_behavior: "release",
    metadata: {},
    current_phase: { start_date: T0, end_date: T1 },
    phases: [
      phase(T0, T1, "price_solo_mensuel", metaSolo),
      phase(T1, T2, "price_solo_annuel", { ...metaSolo, gerimmo_periodicite: "annuel", gerimmo_montant_cents: "5990" }),
    ],
  };
  const echeanciers = new Map<string, Record<string, unknown>>([["sub_sched_1", structuredClone(echeancierInitial)]]);
  type Ligne = { id: string; quantity: number; price: { id: string; product: string; unit_amount: number; recurring: { interval: string } } };
  // Les tarifs connus de ce faux Stripe : ceux des phases, et ceux que créent les mises à jour (price_data).
  const tarifs = new Map<string, Ligne["price"]>([
    ["price_solo_mensuel", { id: "price_solo_mensuel", product: "gerimmo_formule_solo", unit_amount: 599, recurring: { interval: "month" } }],
    ["price_solo_annuel", { id: "price_solo_annuel", product: "gerimmo_formule_solo", unit_amount: 5990, recurring: { interval: "year" } }],
  ]);
  const souscription = {
    id: "sub_1",
    customer: "cus_connu",
    status: "active",
    schedule: "sub_sched_1" as string | null,
    items: { data: [{ id: "si_formule", quantity: 1, price: { ...tarifs.get("price_solo_mensuel")! } }] as Ligne[] },
    metadata: { ...metaSolo } as Record<string, string>,
    trial_end: null,
    cancel_at_period_end: false,
  };
  const introuvable = (id: string) => Object.assign(new Error(`No such object: '${id}'`), { code: "resource_missing" });
  let numero = 0;
  /** Comme Stripe : modifier la phase EN COURS d'un échéancier attaché change ce que la souscription facture. */
  function appliquerPhaseEnCours(id: string, phases: { start_date?: number; end_date: number; items: { price: string; quantity?: number }[]; metadata?: Record<string, string> }[]) {
    if (souscription.schedule !== id) return;
    const t = Math.floor(Date.now() / 1000);
    let debut = phases[0]?.start_date ?? T0;
    for (const p of phases) {
      if (debut <= t && t < p.end_date) {
        souscription.items.data = p.items.map((i, k) => ({
          id: souscription.items.data[k]?.id ?? `si_phase_${++numero}`,
          quantity: i.quantity ?? 1,
          price: { ...(tarifs.get(i.price) ?? { id: i.price, product: "inconnu", unit_amount: 0, recurring: { interval: "month" } }) },
        }));
        if (p.metadata) souscription.metadata = { ...p.metadata };
        return;
      }
      debut = p.end_date;
    }
  }

  const stripe = {
    customers: {
      retrieve: async (id: string) => { await tour(); return { id, metadata: { organization_id: ORG }, invoice_settings: { footer: PIED } }; },
      update: async () => { await tour(); return {}; },
    },
    products: { retrieve: async (id: string) => { await tour(); return { id, active: true }; }, update: async () => ({}), create: async () => ({}) },
    taxRates: { list: () => (async function* () {})(), create: async () => ({ id: "txr_x" }) },
    subscriptions: {
      list: async () => { await tour(); return { data: etat.souscriptionsVivantes }; },
      retrieve: async () => { await tour(); return structuredClone(souscription); },
      update: async (_id: string, p: Record<string, unknown>) => {
        await tour();
        if (etat.refusCarte) throw Object.assign(new Error("Your card was declined."), { type: "StripeCardError", code: "card_declined" });
        if (Array.isArray(p.items)) {
          // Les lignes de la hausse : une ligne gardée garde son identifiant, chaque price_data crée un tarif.
          const elements = p.items as { id?: string; deleted?: boolean; quantity?: number; price_data?: { product: string; unit_amount: number; recurring: { interval: string } } }[];
          souscription.items.data = elements.filter((e) => !e.deleted).map((e) => {
            const prix = { id: `price_maj_${++numero}`, product: e.price_data!.product, unit_amount: e.price_data!.unit_amount, recurring: { ...e.price_data!.recurring } };
            tarifs.set(prix.id, prix);
            return { id: e.id ?? `si_maj_${++numero}`, quantity: e.quantity ?? 1, price: prix };
          });
          etat.hausses += 1;
        }
        if (p.metadata) souscription.metadata = { ...(p.metadata as Record<string, string>) };
        if (typeof p.cancel_at_period_end === "boolean") souscription.cancel_at_period_end = p.cancel_at_period_end;
        if (etat.majSansReponse) throw Object.assign(new Error("An unknown error occurred"), { type: "StripeAPIError", statusCode: 500 });
        return structuredClone(souscription);
      },
    },
    invoices: { createPreview: async () => { await tour(); return { amount_due: 250 }; } },
    subscriptionSchedules: {
      retrieve: async (id: string) => {
        await tour();
        const e = echeanciers.get(id);
        if (!e) throw introuvable(id);
        return structuredClone(e);
      },
      release: async (id: string) => {
        await tour();
        if (etat.avantLiberation) { const geste = etat.avantLiberation; etat.avantLiberation = null; geste(); }
        const e = echeanciers.get(id);
        if (!e) throw introuvable(id);
        // Stripe ne libère qu'un échéancier « not_started » ou « active ».
        if (e.status !== "active" && e.status !== "not_started") {
          etat.liberationsRefusees.push(id);
          throw Object.assign(new Error(`You cannot release a subscription schedule that is currently in the \`${String(e.status)}\` status.`), { type: "StripeInvalidRequestError", statusCode: 400 });
        }
        e.status = "released";
        if (souscription.schedule === id) souscription.schedule = null;
        etat.liberations.push(id);
        return structuredClone(e);
      },
      create: async (p: { from_subscription: string }) => {
        await tour();
        if (etat.echecRecreation) throw Object.assign(new Error("An error occurred with our connection to Stripe."), { type: "StripeConnectionError" });
        const id = `sub_sched_${echeanciers.size + 1}`;
        // Comme Stripe : l'échéancier né de la souscription porte ce qu'elle facture À CET INSTANT.
        const neuf = {
          id, status: "active", end_behavior: "release", metadata: {},
          current_phase: { start_date: T0, end_date: T1 },
          phases: [phase(T0, T1, souscription.items.data[0].price.id, { ...souscription.metadata })],
          subscription: p.from_subscription,
        };
        echeanciers.set(id, neuf);
        souscription.schedule = id;
        etat.echeanciersCrees.push(id);
        return structuredClone(neuf);
      },
      update: async (id: string, p: Record<string, unknown>) => {
        await tour();
        etat.majEcheanciers.push({ id, params: structuredClone(p) });
        const e = echeanciers.get(id);
        if (!e) throw introuvable(id);
        if (Array.isArray(p.phases)) {
          e.phases = structuredClone(p.phases);
          appliquerPhaseEnCours(id, p.phases as Parameters<typeof appliquerPhaseEnCours>[1]);
        }
        return { id };
      },
    },
    checkout: {
      sessions: {
        list: async (p: { customer: string; status: string }) => {
          await tour();
          return { data: etat.sessions.filter((s) => s.customer === p.customer && s.status === p.status).map((s) => ({ ...s })) };
        },
        retrieve: async (id: string) => {
          await tour();
          const s = etat.sessions.find((x) => x.id === id);
          if (!s) throw introuvable(id);
          return { ...s };
        },
        expire: async (id: string) => {
          await tour();
          const s = etat.sessions.find((x) => x.id === id);
          if (!s) throw introuvable(id);
          if (s.status !== "open") throw new Error("Only Checkout Sessions with a status of open can be expired.");
          s.status = "expired";
          return { ...s };
        },
        create: async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
          await tour();
          etat.creations.push({ params, options });
          const corps = JSON.stringify(params);
          const cle = options?.idempotencyKey;
          if (cle && etat.cles.has(cle)) {
            const deja = etat.cles.get(cle)!;
            if (deja.corps !== corps) {
              throw Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters they were first used with."), { type: "StripeIdempotencyError" });
            }
            return { ...deja.session };
          }
          // Stripe : expires_at entre 30 minutes et 24 heures après la création.
          const expire = params.expires_at as number | undefined;
          const now = Math.floor(Date.now() / 1000);
          if (expire !== undefined && (expire < now + 30 * 60 || expire > now + 24 * 3600)) {
            throw Object.assign(new Error("The `expires_at` timestamp must be between 30 minutes and 24 hours from Checkout Session creation."), { type: "StripeInvalidRequestError" });
          }
          const n = etat.sessions.length + 1;
          const s: Session = {
            id: `cs_test_${n}`,
            url: `https://checkout.stripe.test/c/pay/cs_test_${n}`,
            status: "open",
            customer: params.customer as string,
            metadata: (params.metadata ?? {}) as Record<string, string>,
            expires_at: expire,
          };
          etat.sessions.push(s);
          // Comme Stripe : une requête rejouée sous la même clé reçoit la RÉPONSE D'ORIGINE (page « open »), même si la
          // page a été expirée depuis (seconde relecture adverse du 23/10).
          if (cle) etat.cles.set(cle, { corps, session: { ...s } });
          return { ...s };
        },
      },
    },
  };
  /** Un geste d'ailleurs (tableau de bord Stripe, fin naturelle de l'échéancier) : l'échéancier n'est plus attaché. */
  const libererAilleurs = (id: string) => {
    const e = echeanciers.get(id);
    if (e) e.status = "released";
    if (souscription.schedule === id) souscription.schedule = null;
  };
  return { stripe, etat, echeancierInitial, souscription, libererAilleurs };
}

// ── Le faux registre : la sémantique des fonctions SQL de la migration ─────────────────────────────────────────────
function fauxRegistre() {
  const lignes: Intention[] = [];
  const traces: { p_org: string; p_issue: string; p_etapes: unknown[] }[] = [];
  /** Le verrou des gestes de facturation (verrou_facturation_prendre / _rendre) : un bail par organisation. */
  const verrous = new Map<string, { jeton: string; operation: string; expire: number }>();
  const pannes = { poser: 0, terminer: 0 };
  let n = 0;
  const ligne = (i: Intention, reprise: boolean) => ({
    intention: i.id,
    empreinte: i.empreinte,
    stripe_session_id: i.session,
    url: i.url,
    cree_le: i.cree_le.toISOString(),
    expire_le: i.expire_le.toISOString(),
    reprise,
  });
  async function rpc(nom: string, p: Record<string, unknown>) {
    await tour();
    const maintenant = new Date();
    if (nom === "abonnement_client_pose") return { data: null, error: null };
    if (nom === "intention_souscription_reserver") {
      // Corps synchrone : il tient lieu du verrou consultatif par organisation.
      for (const i of lignes) {
        if (i.org !== p.p_org || i.statut !== "en_cours") continue;
        if (i.expire_le <= maintenant) Object.assign(i, { statut: "terminee", motif: "expiree" });
        else if (!i.session && i.cree_le.getTime() <= maintenant.getTime() - (p.p_preparation_secondes as number) * 1000) {
          Object.assign(i, { statut: "terminee", motif: "abandonnee" });
        }
      }
      const en_cours = lignes.find((i) => i.org === p.p_org && i.statut === "en_cours");
      if (en_cours) return { data: [ligne(en_cours, true)], error: null };
      const cree = new Date(Math.floor(maintenant.getTime() / 1000) * 1000);
      const i: Intention = {
        id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
        org: p.p_org as string,
        empreinte: p.p_empreinte as string,
        statut: "en_cours",
        session: null,
        url: null,
        cree_le: cree,
        expire_le: new Date(cree.getTime() + (p.p_duree_minutes as number) * 60_000),
        motif: null,
      };
      lignes.push(i);
      return { data: [ligne(i, false)], error: null };
    }
    if (nom === "intention_souscription_poser") {
      if (pannes.poser > 0) {
        pannes.poser -= 1;
        return { data: null, error: { message: "upstream request timeout" } };
      }
      const i = lignes.find((x) => x.id === p.p_intention && x.org === p.p_org && x.statut === "en_cours" && x.expire_le > maintenant);
      if (!i || (i.session !== null && i.session !== p.p_session)) return { data: false, error: null };
      Object.assign(i, { session: p.p_session, url: p.p_url });
      return { data: true, error: null };
    }
    if (nom === "intention_souscription_terminer") {
      if (pannes.terminer > 0) {
        pannes.terminer -= 1;
        return { data: null, error: { message: "upstream request timeout" } };
      }
      const i = lignes.find((x) => x.id === p.p_intention && x.org === p.p_org && x.statut === "en_cours");
      if (!i || (p.p_motif === "echec" && i.session !== null)) return { data: false, error: null };
      Object.assign(i, { statut: "terminee", motif: p.p_motif });
      return { data: true, error: null };
    }
    if (nom === "abonnement_hausse_tracer") {
      traces.push(p as (typeof traces)[number]);
      return { data: null, error: null };
    }
    if (nom === "verrou_facturation_prendre") {
      // Corps synchrone : il tient lieu de l'insertion « on conflict » de la fonction SQL.
      const tenu = verrous.get(p.p_org as string);
      if (tenu && tenu.expire > maintenant.getTime()) return { data: false, error: null };
      verrous.set(p.p_org as string, { jeton: p.p_jeton as string, operation: p.p_operation as string, expire: maintenant.getTime() + (p.p_duree_secondes as number) * 1000 });
      return { data: true, error: null };
    }
    if (nom === "verrou_facturation_rendre") {
      const tenu = verrous.get(p.p_org as string);
      if (!tenu || tenu.jeton !== p.p_jeton) return { data: false, error: null };
      verrous.delete(p.p_org as string);
      return { data: true, error: null };
    }
    return { data: null, error: { message: `fonction inconnue : ${nom}` } };
  }
  return { lignes, traces, verrous, pannes, rpc };
}

let faux: ReturnType<typeof fauxStripe>;
let registre: ReturnType<typeof fauxRegistre>;

function etatOrganisation(souscrit: boolean) {
  m.rpc.mockImplementation(async (nom: string) => {
    await tour();
    if (nom === "etat_abonnement") {
      return {
        data: [{ statut: souscrit ? "active" : "essai", ecriture_ouverte: true, essai_fin: null, public_tarif: "proprietaire_direct", unites_facturees: 1, en_ligne_possible: true, grille: "2026-09-28", unites_a_couvrir: 1, unites_souscrites: souscrit ? 1 : null }],
        error: null,
      };
    }
    if (nom === "mon_abonnement") {
      return {
        data: [{ souscrit, periodicite: "mensuel", formule: souscrit ? "solo" : null, unites_souscrites: souscrit ? 1 : null, montant_periode_cents: souscrit ? 599 : null, stripe_statut: souscrit ? "active" : null }],
        error: null,
      };
    }
    if (nom === "mon_client_stripe") return { data: "cus_connu", error: null };
    if (nom === "ma_souscription_stripe") return { data: "sub_1", error: null };
    return { data: null, error: null };
  });
}

function souscrire(formule = "solo", montant = 599): FormData {
  const fd = new FormData();
  fd.set("confirmation", "oui");
  fd.set("periodicite", "mensuel");
  fd.set("formule", formule);
  fd.set("montant_attendu_cents", String(montant));
  return fd;
}

function hausse(): FormData {
  const offre = offreParticulier(4, "mensuel");
  const fd = new FormData();
  fd.set("confirmation", "oui");
  fd.set("unites", "4");
  fd.set("formule", offre.formule.code);
  fd.set("montant_attendu_cents", String(offre.montantCents));
  fd.set("proration_date", String(Math.floor(Date.now() / 1000)));
  fd.set("immediat_attendu_cents", "250");
  return fd;
}

/** L'adresse vers laquelle l'action redirige (Next lève une erreur qui la porte), ou l'erreur affichée. */
async function issue(p: Promise<unknown>): Promise<{ url?: string; erreur?: string }> {
  return p.then(
    (r) => ({ erreur: (r as { erreur?: string }).erreur }),
    (e: { url?: string }) => ({ url: e.url })
  );
}
const ouvertes = () => faux.etat.sessions.filter((s) => s.status === "open");
const appelsUtilisateur = () => m.rpc.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  vi.clearAllMocks();
  faux = fauxStripe();
  registre = fauxRegistre();
  m.stripe = faux.stripe;
  m.serviceRpc.mockImplementation(registre.rpc);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("A01 — une seule page de paiement par organisation", () => {
  it("deux onglets en même temps : une seule page Stripe est créée, les deux reçoivent la même adresse", async () => {
    etatOrganisation(false);
    const [a, b] = await Promise.all([
      issue(demarrerAbonnement(ORG, {}, souscrire())),
      issue(demarrerAbonnement(ORG, {}, souscrire())),
    ]);
    expect(a.url, JSON.stringify(a)).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(b.url).toBe(a.url);
    expect(faux.etat.sessions).toHaveLength(1);
    expect(ouvertes()).toHaveLength(1);
    expect(registre.lignes.filter((i) => i.statut === "en_cours")).toHaveLength(1);
  });

  it("la page porte une expiration (entre 30 min et 24 h) et une clé d'idempotence dérivée de la réservation", async () => {
    etatOrganisation(false);
    const r = await issue(demarrerAbonnement(ORG, {}, souscrire()));
    expect(r.url).toBeDefined();
    const [{ params, options }] = faux.etat.creations;
    const intention = registre.lignes[0];
    expect(options?.idempotencyKey).toBe(`souscription:${intention.id}`);
    expect(params.expires_at).toBe(Math.floor(intention.expire_le.getTime() / 1000));
    const delai = (params.expires_at as number) - Math.floor(Date.now() / 1000);
    expect(delai).toBeGreaterThanOrEqual(30 * 60);
    expect(delai).toBeLessThanOrEqual(24 * 3600);
    expect(params.metadata).toMatchObject({ organization_id: ORG, gerimmo_intention: intention.id });
    expect(intention).toMatchObject({ statut: "en_cours", session: "cs_test_1", url: r.url });
  });

  it("un second clic plus tard réutilise la page ouverte au lieu d'en créer une autre", async () => {
    etatOrganisation(false);
    const a = await issue(demarrerAbonnement(ORG, {}, souscrire()));
    const b = await issue(demarrerAbonnement(ORG, {}, souscrire()));
    expect(b.url).toBe(a.url);
    expect(faux.etat.sessions).toHaveLength(1);
    expect(ouvertes()).toHaveLength(1);
  });

  it("une autre formule pendant qu'une page est ouverte : l'ancienne page est expirée chez Stripe avant la nouvelle", async () => {
    etatOrganisation(false);
    const a = await issue(demarrerAbonnement(ORG, {}, souscrire("solo", 599)));
    const b = await issue(demarrerAbonnement(ORG, {}, souscrire("bailleur", 999)));
    expect(b.url).toBeDefined();
    expect(b.url).not.toBe(a.url);
    expect(ouvertes().map((s) => s.url)).toEqual([b.url]);
    expect(registre.lignes.map((i) => [i.statut, i.motif])).toEqual([["terminee", "remplacee"], ["en_cours", null]]);
  });

  it("la page expirée libère la réservation : une nouvelle page peut être ouverte", async () => {
    etatOrganisation(false);
    await issue(demarrerAbonnement(ORG, {}, souscrire()));
    // Le temps a passé : Stripe a expiré la page, la réservation a atteint son terme.
    faux.etat.sessions[0].status = "expired";
    registre.lignes[0].expire_le = new Date(Date.now() - 1000);
    const b = await issue(demarrerAbonnement(ORG, {}, souscrire()));
    expect(b.url).toBe("https://checkout.stripe.test/c/pay/cs_test_2");
    expect(registre.lignes.map((i) => [i.statut, i.motif])).toEqual([["terminee", "expiree"], ["en_cours", null]]);
  });

  it("une souscription vivante découverte chez Stripe : aucune page, la réservation est close comme aboutie", async () => {
    etatOrganisation(false);
    faux.etat.souscriptionsVivantes = [{ id: "sub_vif", status: "active" }];
    const r = await issue(demarrerAbonnement(ORG, {}, souscrire()));
    expect(r.erreur).toMatch(/Un abonnement existe déjà/);
    expect(faux.etat.sessions).toHaveLength(0);
    expect(registre.lignes.map((i) => [i.statut, i.motif])).toEqual([["terminee", "aboutie"]]);
  });
});

describe("A02 — hausse refusée alors qu'un échéancier était programmé", () => {
  it("carte refusée : l'échéancier est recréé à l'identique, et « rien n'a été modifié » redevient exact", async () => {
    etatOrganisation(true);
    faux.etat.refusCarte = true;
    const r = await issue(confirmerHausse(ORG, {}, hausse()));
    expect(r.erreur).toBe("Le changement n'a pas été appliqué, rien n'a été modifié : Votre carte a été refusée par votre banque.");
    expect(faux.etat.liberations).toEqual(["sub_sched_1"]);
    expect(faux.etat.echeanciersCrees).toEqual(["sub_sched_2"]);
    expect(faux.souscription.schedule).toBe("sub_sched_2");
    const [maj] = faux.etat.majEcheanciers;
    expect(maj.id).toBe("sub_sched_2");
    expect(maj.params).toMatchObject({ end_behavior: "release" });
    // Les deux phases lues avant la libération, à l'identique : bornes, prix, quantités, métadonnées.
    const phases = maj.params.phases as { start_date?: number; end_date: number; items: { price: string; quantity: number }[]; metadata: Record<string, string> }[];
    expect(phases.map((p) => [p.end_date, p.items, p.metadata])).toEqual(
      faux.echeancierInitial.phases.map((p) => [p.end_date, [{ price: p.items[0].price, quantity: 1 }], p.metadata])
    );
    expect(phases[0].start_date).toBe(faux.etat.T0);
    // Rien à reprogrammer : la tâche de nuit n'a pas à reprendre l'échéance.
    expect(appelsUtilisateur()).not.toContain("abonnement_changements_a_recalculer");
    expect(registre.traces.map((t) => t.p_issue)).toEqual(["echeancier_restaure"]);
  });

  it("carte refusée et recréation impossible : la phrase dit ce qui s'est passé et l'échéance est marquée à recalculer", async () => {
    etatOrganisation(true);
    faux.etat.refusCarte = true;
    faux.etat.echecRecreation = true;
    const r = await issue(confirmerHausse(ORG, {}, hausse()));
    expect(r.erreur).toBe(
      "La hausse n'a pas été appliquée : Votre carte a été refusée par votre banque. Votre changement programmé pour la prochaine échéance a été retiré pendant la tentative et doit être reprogrammé : nous nous en occupons."
    );
    expect(r.erreur).not.toMatch(/rien n'a été modifié/);
    expect(m.rpc).toHaveBeenCalledWith("abonnement_changements_a_recalculer", { p_org: ORG });
    expect(registre.traces).toHaveLength(1);
    expect(registre.traces[0]).toMatchObject({ p_org: ORG, p_issue: "echeancier_a_reprogrammer" });
    // La ligne d'audit se lit en français dans les journaux de la console.
    expect(libelleActionAudit("abonnement_hausse_non_appliquee")).not.toMatch(/libellé manquant/);
    // Chaque étape externe est tracée, dans l'ordre, avec son résultat.
    expect((registre.traces[0].p_etapes as { etape: string; ok: boolean }[]).map((e) => [e.etape, e.ok])).toEqual([
      ["lecture_souscription", true],
      ["preparation_lignes", true],
      ["lecture_echeancier", true],
      ["liberation_echeancier", true],
      ["mise_a_jour", false],
      ["relecture_souscription", true],
      ["recreation_echeancier", false],
    ]);
  });

  it("hausse acceptée : l'échéancier libéré n'est pas recréé, l'échéance est recalculée (chemin inchangé)", async () => {
    etatOrganisation(true);
    await expect(confirmerHausse(ORG, {}, hausse())).rejects.toMatchObject({ url: `/espace/${ORG}/abonnement?changement=ok` });
    expect(faux.etat.liberations).toEqual(["sub_sched_1"]);
    expect(faux.etat.echeanciersCrees).toEqual([]);
    expect(m.rpc).toHaveBeenCalledWith("abonnement_changements_a_recalculer", { p_org: ORG });
  });
});

describe("A01 — une page non enregistrée ne revient pas, expirée, au clic suivant (relecture adverse du 23/10)", () => {
  it("échec passager de l'enregistrement : le clic suivant reçoit une page NEUVE et ouverte, pas la réponse rejouée", async () => {
    etatOrganisation(false);
    registre.pannes.poser = 1;
    const a = await issue(demarrerAbonnement(ORG, {}, souscrire()));
    // Pas d'« autre onglet » ici : la page n'a simplement pas pu être enregistrée.
    expect(a.erreur).toBe("La page de paiement n'a pas pu être enregistrée. Rien n'a été prélevé : réessayez dans un instant.");
    expect(faux.etat.sessions.map((s) => s.status)).toEqual(["expired"]);
    const b = await issue(demarrerAbonnement(ORG, {}, souscrire()));
    expect(b.url).toBe("https://checkout.stripe.test/c/pay/cs_test_2");
    expect(ouvertes().map((s) => s.url)).toEqual([b.url]);
    expect(registre.lignes.map((i) => [i.statut, i.motif])).toEqual([["terminee", "echec"], ["en_cours", null]]);
  });

  it("seconde relecture : l'enregistrement ET la clôture tombent en panne — le clic suivant reçoit une page neuve, jamais la page expirée rejouée", async () => {
    etatOrganisation(false);
    registre.pannes.poser = 1;
    registre.pannes.terminer = 1;
    const a = await issue(demarrerAbonnement(ORG, {}, souscrire()));
    expect(a.erreur).toBe("La page de paiement n'a pas pu être enregistrée. Rien n'a été prélevé : réessayez dans un instant.");
    // La réservation n'a pas pu être rendue : elle reste en cours, sans page ; la page a été expirée chez Stripe.
    expect(registre.lignes.map((i) => [i.statut, i.session])).toEqual([["en_cours", null]]);
    expect(faux.etat.sessions.map((s) => s.status)).toEqual(["expired"]);
    // Clic suivant, avant la fin du délai de préparation : même intention, même clé — Stripe rejoue cs_test_1 « open ».
    const b = await issue(demarrerAbonnement(ORG, {}, souscrire()));
    expect(b.url, JSON.stringify(b)).toBe("https://checkout.stripe.test/c/pay/cs_test_2");
    expect(ouvertes().map((s) => s.url)).toEqual([b.url]);
    expect(registre.lignes.map((i) => [i.statut, i.motif, i.session])).toEqual([
      ["terminee", "expiree", null],
      ["en_cours", null, "cs_test_2"],
    ]);
  });
});

const formuleHausse = () => offreParticulier(4, "mensuel").formule.code;
const MODIFICATION_EN_COURS =
  "Une autre modification de votre abonnement est en cours (autre onglet ?) : rien n'a été modifié. Réessayez dans quelques secondes.";
/** Aucun motif de Stripe en anglais dans ce que lit le client. */
const ANGLAIS = /You cannot|release|schedule|subscription|declined|error occurred/i;

describe("A02 — deux gestes en même temps sur l'échéancier (relecture adverse du 23/10)", () => {
  it("deux onglets confirment la même hausse : une seule s'applique, l'autre ne repose pas l'ancien échéancier", async () => {
    etatOrganisation(true);
    const [a, b] = await Promise.all([
      issue(confirmerHausse(ORG, {}, hausse())),
      issue(confirmerHausse(ORG, {}, hausse())),
    ]);
    const reussies = [a, b].filter((r) => r.url);
    expect(reussies, JSON.stringify([a, b])).toEqual([{ url: `/espace/${ORG}/abonnement?changement=ok` }]);
    const refusee = [a, b].find((r) => !r.url)!;
    expect(refusee.erreur).toBe(MODIFICATION_EN_COURS);
    expect(refusee.erreur).not.toMatch(ANGLAIS);
    // La hausse payée reste : une seule mise à jour, la nouvelle formule, aucun échéancier recréé par-dessus.
    expect(faux.etat.hausses).toBe(1);
    expect(faux.souscription.metadata.gerimmo_formule).toBe(formuleHausse());
    expect(faux.souscription.items.data[0].price.id).not.toBe("price_solo_mensuel");
    expect(faux.etat.echeanciersCrees).toEqual([]);
    expect(faux.souscription.schedule).toBeNull();
    expect(registre.traces.map((t) => t.p_issue)).not.toContain("echeancier_restaure");
    // Le verrou est rendu : le geste suivant passe.
    expect(registre.verrous.size).toBe(0);
  });

  it.each([
    ["une demande de périodicité", () => { const fd = new FormData(); fd.set("periodicite", "annuel"); return demanderPeriodicite(ORG, {}, fd); }],
    ["une résiliation", () => { const fd = new FormData(); fd.set("resilier", "oui"); return resilierAbonnement(ORG, {}, fd); }],
  ])("%s dans un autre onglet pendant la hausse : l'échéancier qu'elle retire n'est jamais reposé", async (_nom, geste) => {
    etatOrganisation(true);
    // L'autre onglet agit EXACTEMENT entre la lecture de l'échéancier par la hausse et sa libération.
    let autre: Promise<{ url?: string; erreur?: string }> | null = null;
    const lire = faux.stripe.subscriptionSchedules.retrieve;
    faux.stripe.subscriptionSchedules.retrieve = async (id: string) => {
      const lu = await lire(id);
      if (!autre) {
        autre = issue(geste());
        await autre;
      }
      return lu;
    };
    const h = await issue(confirmerHausse(ORG, {}, hausse()));
    const g = await autre!;
    expect(faux.etat.echeanciersCrees, JSON.stringify([h, g])).toEqual([]);
    expect(faux.etat.majEcheanciers).toEqual([]);
    expect(h).toEqual({ url: `/espace/${ORG}/abonnement?changement=ok` });
    expect(g).toEqual({ erreur: MODIFICATION_EN_COURS });
    expect(faux.etat.hausses).toBe(1);
    expect(registre.verrous.size).toBe(0);
  });

  it("le verrou est rendu même quand la hausse échoue ; un verrou indisponible ne laisse passer aucun appel à Stripe", async () => {
    etatOrganisation(true);
    faux.etat.refusCarte = true;
    await issue(confirmerHausse(ORG, {}, hausse()));
    expect(registre.verrous.size).toBe(0);
    expect(m.serviceRpc.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["verrou_facturation_prendre", "verrou_facturation_rendre"]));

    faux = fauxStripe();
    m.stripe = faux.stripe;
    const prendre = m.serviceRpc.getMockImplementation()!;
    m.serviceRpc.mockImplementation(async (nom: string, p: Record<string, unknown>) =>
      nom === "verrou_facturation_prendre" ? { data: null, error: { message: "upstream request timeout" } } : prendre(nom, p)
    );
    const r = await issue(confirmerHausse(ORG, {}, hausse()));
    expect(r.erreur).toBe("La modification de votre abonnement n'a pas pu être préparée : rien n'a été modifié. Réessayez dans un instant.");
    expect(faux.etat.liberations).toEqual([]);
    expect(faux.etat.hausses).toBe(0);
  });

  it("sans verrou non plus : la hausse dont la libération est refusée n'annule pas celle qui vient d'être payée", async () => {
    const offre = offreParticulier(4, "mensuel");
    const params = { subscription: "sub_1", offre, regime: { nature: "franchise" as const }, orgId: ORG, prorationDate: Math.floor(Date.now() / 1000) };
    const stripe = faux.stripe as unknown as Parameters<typeof appliquerHausse>[0];
    const [a, b] = await Promise.all([appliquerHausse(stripe, params), appliquerHausse(stripe, params)]);
    const [ok, ko] = a.ok ? [a, b] : [b, a];
    expect(ok.ok).toBe(true);
    expect(ko).toMatchObject({ ok: false, hausse: "non_appliquee", echeancier: "a_reprogrammer", liberationRefusee: true });
    expect((ko as { erreur: string }).erreur).not.toMatch(ANGLAIS);
    expect(faux.etat.liberationsRefusees).toEqual(["sub_sched_1"]);
    expect(faux.etat.echeanciersCrees).toEqual([]);
    expect(faux.etat.hausses).toBe(1);
    expect(faux.souscription.metadata.gerimmo_formule).toBe(offre.formule.code);
  });

  it("échéancier retiré ailleurs juste avant notre libération : rien n'est reposé, la phrase est en français, l'échéance est recalculée", async () => {
    etatOrganisation(true);
    // Le tableau de bord Stripe (ou la fin naturelle de l'échéancier) le libère entre notre lecture et notre libération.
    faux.etat.avantLiberation = () => faux.libererAilleurs("sub_sched_1");
    const r = await issue(confirmerHausse(ORG, {}, hausse()));
    expect(r.erreur).toBe(
      "La hausse n'a pas été appliquée et rien n'a été prélevé : votre changement programmé pour la prochaine échéance venait d'être retiré ou modifié par ailleurs (autre onglet ?). Ce changement doit être reprogrammé : nous nous en occupons. Rechargez la page avant toute nouvelle tentative."
    );
    expect(r.erreur).not.toMatch(ANGLAIS);
    expect(faux.etat.echeanciersCrees).toEqual([]);
    expect(faux.etat.hausses).toBe(0);
    expect(m.rpc).toHaveBeenCalledWith("abonnement_changements_a_recalculer", { p_org: ORG });
    expect(registre.traces.map((t) => t.p_issue)).toEqual(["echeancier_a_reprogrammer"]);
  });

  it("sans échéancier, une hausse sans réponse de Stripe mais appliquée est dite incertaine et tracée — jamais « rien n'a été modifié »", async () => {
    etatOrganisation(true);
    faux.souscription.schedule = null;
    faux.etat.majSansReponse = true;
    const r = await issue(confirmerHausse(ORG, {}, hausse()));
    expect(r.erreur).toBe(
      "Notre prestataire de paiement n'a pas confirmé si la hausse a été appliquée. Rechargez la page dans un instant pour voir votre abonnement à jour, avant toute nouvelle tentative."
    );
    expect(r.erreur).not.toMatch(/rien n'a été modifié|Rien n'a été prélevé/);
    expect(registre.traces.map((t) => t.p_issue)).toEqual(["hausse_incertaine"]);
    expect(appelsUtilisateur()).not.toContain("abonnement_changements_a_recalculer");
  });
});
