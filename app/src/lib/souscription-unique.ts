import "server-only";
import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { ArretSupervision } from "./controle-effets";
import {
  expirerPageDePaiement,
  lireErreurStripe,
  messageStripePourClient,
  verifierAucuneSouscriptionVivante,
  type Echec,
  type Reussite,
} from "@/lib/stripe";
import { creerSessionOffre, GRILLE, type ChoixOffre, type IntentionSouscription } from "@/lib/stripe-offres";
import type { Offre, RegimeTva } from "@/lib/tarifs";

// UNE PAGE DE PAIEMENT PAR ORGANISATION (défaut A01, audit du 23/10/2026, P1).
//
// Le contrôle « abonnement ou page déjà ouverts » (verifierAucuneSouscriptionVivante) LIT l'existant chez Stripe, puis
// la page est créée : deux onglets qui cliquent ensemble lisent tous deux « rien », et ouvrent chacun une page
// utilisable — deux souscriptions possibles. Rien n'était RÉSERVÉ. Désormais :
//  1. la base réserve UNE intention par organisation, sous verrou, avec un index unique partiel qui l'impose
//     (`intention_souscription_reserver`, migration 20261023162446) ;
//  2. la demande qui arrive pendant qu'une intention est en cours la PARTAGE : même empreinte → même requête à Stripe,
//     sous la même clé d'idempotence (`souscription:<intention>`), donc la même page ; page déjà posée → son adresse ;
//  3. une demande DIFFÉRENTE (autre formule, autre retour) ferme d'abord la page de l'intention en cours chez Stripe,
//     puis la réservation, et en prend une nouvelle ;
//  4. la page porte `expires_at` = fin de la réservation : quand l'une expire, l'autre aussi ; une page payée, ou une
//     souscription née entre-temps, clôt la réservation (« aboutie »), un échec de création la clôt (« echec ») ;
//  5. le filet existant reste : le webhook ignore et journalise une seconde souscription vivante
//     (`[stripe webhook][double-souscription]`).

/** Durée d'une réservation, et donc de la page Stripe (Stripe accepte de 30 min à 24 h après la création). */
export const DUREE_PAGE_PAIEMENT_MINUTES = 45;
/**
 * Délai au-delà duquel une réservation SANS page est tenue pour interrompue (la demande qui l'a prise a échoué sans
 * la libérer) : la suivante la reprend. Court devant les 15 min de marge entre 45 et 30 min.
 */
export const DELAI_PREPARATION_SECONDES = 120;

export type DemandeSouscription = {
  offre: Offre;
  regime: RegimeTva;
  customer: string;
  orgId: string;
  retourOk: string;
  retourAnnule: string;
  essaiFin?: string | null;
  choix?: ChoixOffre;
};

/** Ce que la base rend d'une réservation (`intention_souscription_reserver`). */
export type IntentionLue = {
  intention: string;
  empreinte: string;
  stripe_session_id: string | null;
  url: string | null;
  cree_le: string;
  expire_le: string;
  /** Vrai si l'intention était déjà en cours (prise par une autre demande). */
  reprise: boolean;
};

export type MotifFin = "remplacee" | "aboutie" | "echec" | "expiree";

/** Le registre des intentions, en base (clé de service). Les tests en donnent une doublure. */
export type RegistreIntentions = {
  reserver(org: string, empreinte: string): Promise<IntentionLue | null>;
  poserPage(org: string, intention: string, session: string, url: string): Promise<boolean>;
  terminer(org: string, intention: string, motif: MotifFin): Promise<boolean>;
};

type ClientRpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function lireIntention(data: unknown): IntentionLue | null {
  const l = (Array.isArray(data) ? data[0] : data) as Partial<IntentionLue> | null | undefined;
  if (!l || typeof l !== "object") return null;
  if (typeof l.intention !== "string" || !UUID.test(l.intention)) return null;
  if (typeof l.empreinte !== "string" || typeof l.cree_le !== "string" || typeof l.expire_le !== "string") return null;
  if (!Number.isFinite(Date.parse(l.cree_le)) || !Number.isFinite(Date.parse(l.expire_le))) return null;
  return {
    intention: l.intention,
    empreinte: l.empreinte,
    stripe_session_id: typeof l.stripe_session_id === "string" ? l.stripe_session_id : null,
    url: typeof l.url === "string" ? l.url : null,
    cree_le: l.cree_le,
    expire_le: l.expire_le,
    reprise: l.reprise === true,
  };
}

/** Le registre adossé aux fonctions SQL de la migration 20261023162446 (réservées à la clé de service). */
export function registreDeService(service: ClientRpc): RegistreIntentions {
  return {
    async reserver(org, empreinte) {
      const { data, error } = await service.rpc("intention_souscription_reserver", {
        p_org: org,
        p_empreinte: empreinte,
        p_duree_minutes: DUREE_PAGE_PAIEMENT_MINUTES,
        p_preparation_secondes: DELAI_PREPARATION_SECONDES,
      });
      if (error) {
        console.error("[souscription] réservation impossible :", error.message.slice(0, 200));
        return null;
      }
      return lireIntention(data);
    },
    async poserPage(org, intention, session, url) {
      const { data, error } = await service.rpc("intention_souscription_poser", {
        p_org: org, p_intention: intention, p_session: session, p_url: url,
      });
      if (error) console.error("[souscription] page non enregistrée :", error.message.slice(0, 200));
      return !error && data === true;
    },
    async terminer(org, intention, motif) {
      const { data, error } = await service.rpc("intention_souscription_terminer", {
        p_org: org, p_intention: intention, p_motif: motif,
      });
      if (error) console.error("[souscription] réservation non close :", error.message.slice(0, 200));
      return !error && data === true;
    },
  };
}

/**
 * L'empreinte d'une demande : tout ce qui entre dans la requête de création de la page. Deux demandes de même
 * empreinte envoient à Stripe la même requête (même clé d'idempotence, mêmes paramètres) ; une empreinte différente
 * est une AUTRE demande, qui remplace la page en cours.
 */
export function empreinteDemande(d: DemandeSouscription): string {
  const canon = JSON.stringify([
    GRILLE,
    d.orgId,
    d.customer,
    d.offre.public,
    d.offre.periodicite,
    d.offre.public === "particulier" ? d.offre.formule.code : null,
    d.offre.capacite,
    d.offre.montantCents,
    d.offre.lignes.map((l) => [l.produit, l.quantite, l.prixUnitaireCents]),
    d.regime.nature === "assujetti" ? ["assujetti", d.regime.tauxPourcent] : [d.regime.nature],
    d.choix ?? "auto",
    d.essaiFin ?? null,
    d.retourOk,
    d.retourAnnule,
  ]);
  return createHash("sha256").update(canon).digest("hex");
}

const RESERVATION_IMPOSSIBLE =
  "La page de paiement n'a pas pu être préparée (réservation indisponible). Rien n'a été prélevé : réessayez dans un instant.";
const AUTRE_DEMANDE_EN_COURS =
  "Une page de paiement est en cours d'ouverture pour cette organisation (autre onglet ?). Rien n'a été prélevé : réessayez dans quelques secondes.";
const PAGE_DEJA_PAYEE =
  "Un paiement vient d'aboutir pour cette organisation : rechargez la page dans quelques secondes. Rien ne sera prélevé deux fois.";
const PAGE_NON_ENREGISTREE =
  "La page de paiement n'a pas pu être enregistrée. Rien n'a été prélevé : réessayez dans un instant.";

/** Une page ouverte n'est remise au client que s'il lui reste au moins ce temps pour payer (relecture du 23/10). */
export const MARGE_REUTILISATION_PAGE_MINUTES = 15;

/** Stripe ne connaît pas (ou plus) cette page avec ces clés : supprimée, ou créée dans l'autre mode (test / réel). */
function pageIntrouvable(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown } | null;
  return err?.code === "resource_missing" || /similar object exists in (test|live) mode/i.test(String(err?.message ?? ""));
}

/**
 * Ouvrir — ou rouvrir — LA page de paiement de l'organisation pour cette demande.
 * Rend l'adresse à laquelle envoyer le client ; `reprise` dit qu'elle était déjà ouverte (autre onglet, second clic).
 */
export async function ouvrirPageDePaiementUnique(
  stripe: Stripe,
  registre: RegistreIntentions,
  demande: DemandeSouscription
): Promise<Reussite<{ url: string; reprise: boolean }> | Echec> {
  const empreinte = empreinteDemande(demande);
  const org = demande.orgId;
  // Deux tours au plus : le second suit le remplacement d'une page d'une autre demande, ou une page morte.
  for (let tour = 0; tour < 2; tour++) {
    const r = await registre.reserver(org, empreinte);
    if (!r) return { ok: false, erreur: RESERVATION_IMPOSSIBLE };

    // ── Une page ouverte existe déjà pour cette réservation : la réutiliser si elle vit encore.
    if (r.stripe_session_id && r.url) {
      let etat: Stripe.Checkout.Session["status"] | "introuvable";
      try {
        etat = (await stripe.checkout.sessions.retrieve(r.stripe_session_id)).status;
      } catch (e) {
        if (e instanceof ArretSupervision) throw e;
        // Relecture adverse du 23/10 : une page que Stripe ne connaît plus avec ces clés (supprimée, ou créée avec la
        // clé de test avant le passage au réel) ne servira plus à personne. Elle libère la place au lieu de bloquer
        // la souscription jusqu'à la fin de la réservation. Une panne passagère, elle, garde la réservation.
        if (!pageIntrouvable(e)) return { ok: false, erreur: messageStripePourClient(e) };
        console.error("[souscription] page enregistrée introuvable chez Stripe :", lireErreurStripe(e).slice(0, 200));
        etat = "introuvable";
      }
      if (etat === "complete") {
        await registre.terminer(org, r.intention, "aboutie");
        return { ok: false, erreur: PAGE_DEJA_PAYEE };
      }
      if (etat !== "open") {
        // Expirée (ou introuvable) chez Stripe avant la fin de la réservation : la place est libérée, on recommence (une fois).
        await registre.terminer(org, r.intention, "expiree");
        if (tour > 0) return { ok: false, erreur: AUTRE_DEMANDE_EN_COURS };
        continue;
      }
      // Relecture adverse du 23/10 : une page qui expire dans quelques secondes n'est plus remise au client (il n'aurait
      // pas le temps de saisir sa carte) ; elle est fermée et remplacée, comme celle d'une autre demande.
      const reutilisable = Date.parse(r.expire_le) - Date.now() >= MARGE_REUTILISATION_PAGE_MINUTES * 60_000;
      if (r.empreinte === empreinte && reutilisable) {
        // Une souscription née entre-temps (webhook pas encore reçu) : pas de page.
        const libre = await verifierAucuneSouscriptionVivante(stripe, demande.customer, r.intention);
        if (!libre.ok) {
          if (libre.vivante) await registre.terminer(org, r.intention, "aboutie");
          return { ok: false, erreur: libre.erreur };
        }
        return { ok: true, url: r.url, reprise: true };
      }
      // Autre demande (ou page presque expirée) : fermer d'abord sa page chez Stripe, puis la réservation. Une fois par
      // demande : deux onglets qui demandent deux formules différentes ne se ferment pas indéfiniment la page l'un de
      // l'autre.
      if (tour > 0) return { ok: false, erreur: AUTRE_DEMANDE_EN_COURS };
      let fin: "expired" | "complete";
      try {
        fin = await expirerPageDePaiement(stripe, r.stripe_session_id);
      } catch (e) {
        if (e instanceof ArretSupervision) throw e;
        return { ok: false, erreur: messageStripePourClient(e) };
      }
      if (fin === "complete") {
        await registre.terminer(org, r.intention, "aboutie");
        return { ok: false, erreur: PAGE_DEJA_PAYEE };
      }
      await registre.terminer(org, r.intention, "remplacee");
      continue;
    }

    // ── Réservation sans page : la nôtre (nouvelle), ou celle d'un autre onglet en train de l'ouvrir.
    if (r.empreinte !== empreinte) return { ok: false, erreur: AUTRE_DEMANDE_EN_COURS };
    const intention: IntentionSouscription = {
      id: r.intention,
      creeLeMs: Date.parse(r.cree_le),
      expireLeS: Math.floor(Date.parse(r.expire_le) / 1000),
    };
    const page = await creerSessionOffre(stripe, { ...demande, intention });
    if (!page.ok) {
      if (page.vivante) {
        await registre.terminer(org, r.intention, "aboutie");
        return { ok: false, erreur: page.erreur };
      }
      // Seule la demande qui a pris la réservation la rend (et la base la garde si un autre onglet y a déjà posé sa
      // page). Celle qui la partage peut échouer seule — clé d'idempotence encore en usage chez Stripe, par exemple —
      // sans priver l'autre de sa page : elle le dit en français plutôt que de recopier le message technique.
      if (!r.reprise) {
        await registre.terminer(org, r.intention, "echec");
        return { ok: false, erreur: page.erreur };
      }
      return { ok: false, erreur: AUTRE_DEMANDE_EN_COURS };
    }
    if (!(await registre.poserPage(org, r.intention, page.session, page.url))) {
      // La réservation a été reprise ou a expiré entre-temps, ou l'enregistrement a échoué : cette page ne doit servir
      // à personne.
      try {
        await expirerPageDePaiement(stripe, page.session);
      } catch (e) {
        if (e instanceof ArretSupervision) throw e;
        console.error("[souscription] page orpheline non expirée :", lireErreurStripe(e).slice(0, 200));
      }
      // Relecture adverse du 23/10 : la réservation est rendue. Sinon le clic suivant reprenait la même intention, donc
      // la même clé d'idempotence, et Stripe lui rejouait la réponse d'origine : la page qu'on vient d'expirer. La base
      // garde l'intention si un autre onglet y a déjà posé SA page (« echec » est alors refusé).
      await registre.terminer(org, r.intention, "echec");
      return { ok: false, erreur: PAGE_NON_ENREGISTREE };
    }
    return { ok: true, url: page.url, reprise: r.reprise };
  }
  return { ok: false, erreur: AUTRE_DEMANDE_EN_COURS };
}
