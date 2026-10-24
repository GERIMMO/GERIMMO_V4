import "server-only";
// LES GESTES DE LA FERMETURE DES COMPTES (plan de conformité du 23/10/2026, lot 1E : R14, R15, R51).
//
// La base décide et efface (migration 20261024130000 : programmer_fermeture_compte, executer_fermeture_compte, procédure
// pg_cron « fermetures-comptes » de 3 h 20 UTC). Ici, ce qu'elle ne peut pas faire :
//  · chez Stripe, AVANT la programmation : relever l'état de la souscription (résiliation déjà demandée, date d'arrêt,
//    échéancier), l'arrêter à la date d'effet (fin de la période payée, ou J+14 avec un remboursement de la part non
//    utilisée de CHAQUE paiement de la période) — et remettre l'état relevé si la fermeture est annulée ;
//  · chaque nuit (mission « purge », 3 h 40 UTC) : rembourser dès que la souscription est arrêtée chez Stripe (même si la
//    fermeture est gelée ou annulée après), retirer les fichiers hors du compartiment `documents` (registres privés
//    d'artisan, préparations de devis, archives d'export), envoyer « Votre compte Gerimmo est fermé », envoyer les
//    avertissements d'inactivité J-60 et J-15 (règle active seulement quand VERSION_MIN_INACTIVITE est posée),
//    supprimer les archives d'export de plus de sept jours, préparer les archives demandées restées en attente, et
//    supprimer les clients Stripe arrivés au terme de leurs factures (six ans).
// Relectures adverses du 24/10 : montant établi sur tous les paiements de la période (prorata d'une hausse compris),
// J+14 refusé quand il ne peut pas l'être ou quand la période finit avant ; remboursement retrouvé chez Stripe avant
// toute création (la clé d'idempotence ne dure que 24 h) ; état d'avant remis à l'annulation ; courriel de fin qui
// n'attend pas un remboursement en échec plus de sept jours.
// Finitions du 24/10 (relectures transverses) : la souscription arrêtée par une fermeture porte la marque
// MARQUE_FERMETURE_STRIPE (le webhook n'envoie ni accusé de résiliation ni courrier d'impayé) ; un essai qui finit avant
// le quatorzième jour s'arrête à sa fin, sans première facture (M2) ; l'annulation relit la souscription et garde une
// résiliation notifiée depuis (I5) ; le remboursement ne part que si la souscription s'est bien arrêtée à la date
// prévue (I2), jamais sur un paiement déjà remboursé (I3) ; les gestes Stripe s'arrêtent aussi avec l'arrêt
// « Abonnements » (M1).

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArretSupervision } from "@/lib/controle-effets";
import { envoyerEmail } from "@/lib/email";
import { adresseDuSite } from "@/lib/site";
import { libererEcheancierDe, resilierAEcheance } from "@/lib/stripe-offres";
import { lireErreurStripe } from "@/lib/stripe";
import {
  MARQUE_FERMETURE_STRIPE,
  SUJET_COMPTE_FERME,
  VERSION_MIN_INACTIVITE,
  corpsAvertissementInactivite,
  corpsCompteFerme,
  jourEnLettres,
  jourParisPlus,
  minuitParisEnSecondes,
  sujetAvertissementInactivite,
  versionInactiviteValide,
  type BilanFermeture,
  type ChoixFermeture,
  type MotifRemboursementFermeture,
  type OrigineFermeture,
} from "@/lib/comptes-fermeture";
import { construireExportsEnAttente, supprimerExportsExpires } from "@/lib/export-complet-serveur";

/** La souscription figée par la base (`abonnement_de_fermeture`). */
export type AbonnementFermeture = {
  organisation?: string;
  stripe_subscription_id?: string | null;
  stripe_statut?: string | null;
  periode_debut?: string | null;
  periode_fin?: string | null;
  vivante?: boolean;
  payee_en_cours?: boolean;
  souscriptions_vivantes?: number;
};

/**
 * L'état de la souscription chez Stripe avant la fermeture : remis à l'identique si elle est annulée. `pose` et
 * `arret_pose` disent ce que la fermeture a posé elle-même (fin de période, ou date d'arrêt) : l'annulation ne défait
 * que cela, et garde ce que le client ou l'équipe a changé depuis (finitions du 24/10, I5).
 */
export type EtatStripeAvant = {
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  schedule: string | null;
  pose?: "fin_periode" | "cancel_at";
  arret_pose?: number | null;
};

/** Une souscription dans l'un de ces états ne facture plus. */
const TERMINEE = new Set(["canceled", "incomplete_expired"]);
/** Marge entre l'arrêt prévu et la fin constatée chez Stripe avant de conclure que la souscription a continué. */
const MARGE_ARRET_MS = 36 * 3_600_000;

/** La part non utilisée d'un paiement, à rembourser sur ce paiement. */
export type PartRemboursement = { facture: string; montant_cents: number };

export type PreparationStripe =
  | { ok: true; remboursement: { montant_cents: number; factures: PartRemboursement[] } | null; arret: string | null; avant: EtatStripeAvant | null }
  | { ok: false; erreur: string };

function etatAvant(s: Stripe.Subscription): EtatStripeAvant {
  const brut = s as unknown as { cancel_at_period_end?: boolean; cancel_at?: number | null; schedule?: string | { id: string } | null };
  return {
    cancel_at_period_end: brut.cancel_at_period_end === true,
    cancel_at: typeof brut.cancel_at === "number" ? brut.cancel_at : null,
    schedule: typeof brut.schedule === "string" ? brut.schedule : (brut.schedule?.id ?? null),
  };
}

type LigneFacture = { amount: number; period?: { start?: number; end?: number } };
type FacturePayee = { id?: string; amount_paid?: number | null; lines?: { data?: LigneFacture[]; has_more?: boolean } };

/**
 * La part non utilisée de la période, paiement par paiement : pour chaque facture payée de la souscription, chaque ligne
 * compte pour la fraction de sa propre période qui reste après l'arrêt (le prorata d'une hausse en cours de période
 * porte ses deux lignes, nouveau prix et ancien prix repris), rapportée à ce que la facture a réellement encaissé
 * (remise ou taxe comprises). Chaque paiement rembourse sa propre part, jamais plus que ce qu'il a payé.
 */
export async function calculerRemboursement(
  stripe: Stripe,
  sub: string,
  arret: Date
): Promise<{ ok: true; montant_cents: number; factures: PartRemboursement[] } | { ok: false; erreur: string }> {
  const t = Math.floor(arret.getTime() / 1000);
  const liste = await stripe.invoices.list({ subscription: sub, status: "paid", limit: 24 });
  const factures: PartRemboursement[] = [];
  for (const f of (liste.data ?? []) as unknown as FacturePayee[]) {
    const paye = Number(f.amount_paid ?? 0);
    if (!f.id || !Number.isSafeInteger(paye) || paye <= 0) continue;
    if (f.lines?.has_more) return { ok: false, erreur: `La facture ${f.id} a trop de lignes pour établir le montant : choisissez la fin de la période payée.` };
    const lignes = f.lines?.data ?? [];
    let somme = 0;
    let reste = 0;
    for (const l of lignes) {
      const debut = Number(l.period?.start), fin = Number(l.period?.end), montant = Number(l.amount);
      if (!Number.isFinite(debut) || !Number.isFinite(fin) || !Number.isFinite(montant) || fin <= debut) continue;
      somme += montant;
      if (fin > t) reste += montant * (fin - Math.max(t, debut)) / (fin - debut);
    }
    if (somme <= 0 || reste <= 0) continue;
    const part = Math.min(paye, Math.round((reste * paye) / somme));
    if (part > 0) factures.push({ facture: f.id, montant_cents: part });
  }
  const montant = factures.reduce((n, p) => n + p.montant_cents, 0);
  if (montant <= 0) return { ok: false, erreur: "Le montant de la part non utilisée n'a pas pu être établi chez Stripe : choisissez la fin de la période payée, ou réessayez." };
  return { ok: true, montant_cents: montant, factures };
}

/**
 * Arrête la souscription à la date d'effet de la fermeture, AVANT de la programmer en base, après avoir relevé son état :
 *  · abonnement payé en cours, fin de période : résiliation à l'échéance (l'échéancier éventuel est libéré) ;
 *  · abonnement payé en cours, J+14 : refusé si la période payée finit avant le quatorzième jour (Stripe la
 *    renouvellerait, facturée entière) ou si le montant ne peut pas être établi ; sinon montant calculé D'ABORD, puis arrêt
 *    à minuit (heure de Paris) du quatorzième jour, sans avoir au prorata chez Stripe ;
 *  · souscription vivante non payée (essai, impayé) : arrêt au quatorzième jour, rien à rembourser ;
 *  · aucune souscription vivante : rien chez Stripe.
 */
export async function preparerStripeFermeture(
  stripe: Stripe,
  abo: AbonnementFermeture,
  choix: ChoixFermeture | null,
  maintenant: Date = new Date()
): Promise<PreparationStripe> {
  const sub = abo.stripe_subscription_id;
  if (!abo.vivante || !sub) return { ok: true, remboursement: null, arret: null, avant: null };
  try {
    if (abo.payee_en_cours && choix !== "fin_periode" && choix !== "j14_prorata") {
      return { ok: false, erreur: "Un abonnement payé est en cours : choisissez la fin de la période payée ou une fermeture à quatorze jours avec remboursement." };
    }
    const arret = minuitParisEnSecondes(jourParisPlus(maintenant, 14));
    if (abo.payee_en_cours && choix === "j14_prorata" && abo.periode_fin && new Date(abo.periode_fin).getTime() <= arret * 1000) {
      return { ok: false, erreur: `La période payée se termine le ${jourEnLettres(abo.periode_fin)}, avant le quatorzième jour : choisissez la fin de la période payée.` };
    }
    const actuelle = await stripe.subscriptions.retrieve(sub);
    const releve = etatAvant(actuelle);
    const marque = { [MARQUE_FERMETURE_STRIPE]: "programmee" };
    if (abo.payee_en_cours && choix === "fin_periode") {
      const r = await resilierAEcheance(stripe, { subscription: sub, resilier: true, metadata: marque });
      return r.ok
        ? { ok: true, remboursement: null, arret: abo.periode_fin ?? null, avant: { ...releve, pose: "fin_periode", arret_pose: null } }
        : { ok: false, erreur: r.erreur };
    }
    // Finitions du 24/10 (relecture transverse, M2) : un essai qui finit avant le quatorzième jour s'arrête à sa fin
    // (fin de la période d'essai), sans première facture émise après la demande de fermeture.
    const brute = actuelle as unknown as { status?: string; trial_end?: number | null };
    const finEssai = !abo.payee_en_cours && brute.status === "trialing" && typeof brute.trial_end === "number"
      && brute.trial_end * 1000 > maintenant.getTime() && brute.trial_end < arret ? brute.trial_end : null;
    if (finEssai !== null) {
      const r = await resilierAEcheance(stripe, { subscription: sub, resilier: true, metadata: marque });
      return r.ok
        ? { ok: true, remboursement: null, arret: new Date(finEssai * 1000).toISOString(), avant: { ...releve, pose: "fin_periode", arret_pose: null } }
        : { ok: false, erreur: r.erreur };
    }
    let remboursement: { montant_cents: number; factures: PartRemboursement[] } | null = null;
    if (abo.payee_en_cours) {
      const calcul = await calculerRemboursement(stripe, sub, new Date(arret * 1000));
      if (!calcul.ok) return { ok: false, erreur: calcul.erreur };
      remboursement = { montant_cents: calcul.montant_cents, factures: calcul.factures };
    }
    const libere = await libererEcheancierDe(stripe, sub);
    if (!libere.ok) return { ok: false, erreur: libere.erreur };
    await stripe.subscriptions.update(sub, { cancel_at: arret, proration_behavior: "none", metadata: marque });
    return { ok: true, remboursement, arret: new Date(arret * 1000).toISOString(), avant: { ...releve, pose: "cancel_at", arret_pose: arret } };
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    return { ok: false, erreur: lireErreurStripe(e) };
  }
}

/**
 * Défait l'arrêt posé par preparerStripeFermeture (fermeture annulée, ou programmation refusée par la base) en remettant
 * l'état relevé avant : une résiliation déjà demandée par le client reste demandée, une date d'arrêt antérieure revient
 * (relecture du 24/10, R2-2). Un échéancier libéré à la programmation ne se recrée pas : `echeancierNonRetabli` le dit
 * (la base remet l'échéance « à préparer », la tâche de nuit le reprogramme).
 *
 * Finitions du 24/10 (relecture transverse, I5) : la souscription est RELUE d'abord. Si l'état n'est plus celui que la
 * fermeture a posé (résiliation du client, autre date d'arrêt, arrêt déjà levé), il est gardé tel quel ; si une
 * résiliation a été notifiée ou accusée depuis la programmation (`resiliationNotifiee`, lue en base), elle est remise à
 * l'échéance au lieu de tout lever. La marque de la fermeture est retirée dans tous les cas.
 */
export async function annulerStripeFermeture(
  stripe: Stripe,
  abo: AbonnementFermeture,
  choix: ChoixFermeture | null,
  avant?: EtatStripeAvant | null,
  options: { resiliationNotifiee?: boolean } = {}
): Promise<{ ok: true; echeancierNonRetabli: boolean; etatGarde?: boolean } | { ok: false; erreur: string }> {
  const sub = abo.stripe_subscription_id;
  if (!abo.vivante || !sub) return { ok: true, echeancierNonRetabli: false };
  const echeancierNonRetabli = Boolean(avant?.schedule);
  const sansMarque = { [MARQUE_FERMETURE_STRIPE]: "" };
  try {
    const actuelle = await stripe.subscriptions.retrieve(sub);
    if (TERMINEE.has((actuelle as unknown as { status?: string }).status ?? "")) return { ok: true, echeancierNonRetabli, etatGarde: true };
    const etat = etatAvant(actuelle);
    const pose = avant?.pose ?? (abo.payee_en_cours && choix === "fin_periode" ? "fin_periode" : "cancel_at");
    const poseIntacte = pose === "fin_periode"
      ? etat.cancel_at_period_end
      : !etat.cancel_at_period_end && etat.cancel_at !== null && (avant?.arret_pose == null || etat.cancel_at === avant.arret_pose);
    if (options.resiliationNotifiee) {
      // Le client a notifié sa résiliation après la programmation : elle reste, à l'échéance.
      if (!etat.cancel_at_period_end && etat.cancel_at !== null) await stripe.subscriptions.update(sub, { cancel_at: "", metadata: sansMarque });
      await stripe.subscriptions.update(sub, { cancel_at_period_end: true, metadata: sansMarque });
      return { ok: true, echeancierNonRetabli, etatGarde: true };
    }
    if (!poseIntacte) {
      // Changé depuis la programmation (résiliation, autre date, arrêt levé) : gardé tel quel, marque retirée.
      await stripe.subscriptions.update(sub, { metadata: sansMarque });
      return { ok: true, echeancierNonRetabli, etatGarde: true };
    }
    if (pose === "fin_periode") {
      if (avant?.cancel_at_period_end) {
        await stripe.subscriptions.update(sub, { metadata: sansMarque });
        return { ok: true, echeancierNonRetabli };
      }
      const r = await resilierAEcheance(stripe, { subscription: sub, resilier: false, metadata: sansMarque });
      return r.ok ? { ok: true, echeancierNonRetabli } : { ok: false, erreur: r.erreur };
    }
    if (avant?.cancel_at) {
      await stripe.subscriptions.update(sub, { cancel_at: avant.cancel_at, metadata: sansMarque });
    } else {
      await stripe.subscriptions.update(sub, { cancel_at: "", metadata: sansMarque });
      if (avant?.cancel_at_period_end) await stripe.subscriptions.update(sub, { cancel_at_period_end: true });
    }
    return { ok: true, echeancierNonRetabli };
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    return { ok: false, erreur: lireErreurStripe(e) };
  }
}

export type RemboursementFait = { facture: string; remboursement: string; montant_cents: number };

/** Le paiement est déjà entièrement remboursé (Stripe refuse un remboursement de plus). */
function dejaRembourseChezStripe(e: unknown): boolean {
  return (e as { code?: string })?.code === "charge_already_refunded";
}

/**
 * Le remboursement de la part non utilisée, paiement par paiement. Avant toute création, les remboursements du paiement
 * sont relus chez Stripe : celui de cette fermeture et de cette facture (métadonnées) est repris tel quel, jamais refait
 * (relecture du 24/10, I6 : la clé d'idempotence ne protège que 24 heures). Une part en échec n'empêche pas les
 * suivantes ; la nuit suivante reprend sans doublon.
 * Finitions du 24/10 (relecture transverse, I3) : ce que d'autres remboursements (une rétractation, un geste de
 * l'équipe) ont déjà rendu sur le paiement est déduit ; un paiement déjà entièrement remboursé est un état final
 * (`dejaRemboursees`), jamais une erreur reprise chaque nuit.
 */
export async function rembourserFermeture(
  stripe: Stripe,
  p: { fermetureId: string; parts: PartRemboursement[]; avantEffet?: () => Promise<void> }
): Promise<{ ok: true; faits: RemboursementFait[]; dejaRemboursees: string[] } | { ok: false; erreur: string; faits: RemboursementFait[]; dejaRemboursees: string[] }> {
  const faits: RemboursementFait[] = [];
  const dejaRemboursees: string[] = [];
  if (p.parts.length === 0 || p.parts.some((x) => !Number.isSafeInteger(x.montant_cents) || x.montant_cents <= 0 || !/^in_[A-Za-z0-9_]+$/.test(x.facture))) {
    return { ok: false, erreur: "Montant de remboursement invalide.", faits, dejaRemboursees };
  }
  let erreur: string | null = null;
  for (const part of p.parts) {
    try {
      const paiements = await stripe.invoicePayments.list({ invoice: part.facture, status: "paid", limit: 1 });
      const ligne = paiements.data[0] as (typeof paiements.data)[number] & { amount_paid?: number | null } | undefined;
      const paiement = ligne?.payment;
      const intention = typeof paiement?.payment_intent === "string" ? paiement.payment_intent : paiement?.payment_intent?.id;
      const charge = typeof paiement?.charge === "string" ? paiement.charge : paiement?.charge?.id;
      if (!intention && !charge) { erreur = `Paiement de la facture ${part.facture} introuvable chez Stripe.`; continue; }
      const cible = intention ? { payment_intent: intention } : { charge: charge as string };
      const existants = (await stripe.refunds.list({ ...cible, limit: 100 })).data ?? [];
      const valides = existants.filter((r) => r.status !== "failed" && r.status !== "canceled");
      const deja = valides.find((r) => r.metadata?.fermeture === p.fermetureId
        && (r.metadata?.facture === part.facture || r.metadata?.facture === undefined));
      if (deja) { faits.push({ facture: part.facture, remboursement: deja.id, montant_cents: deja.amount }); continue; }
      const paye = Number(ligne?.amount_paid ?? NaN);
      const rendu = valides.reduce((n, r) => n + Number(r.amount ?? 0), 0);
      const reste = Number.isSafeInteger(paye) && paye > 0 ? paye - rendu : part.montant_cents;
      if (reste <= 0) { dejaRemboursees.push(part.facture); continue; }
      await p.avantEffet?.();
      const r = await stripe.refunds.create(
        { ...cible, amount: Math.min(part.montant_cents, reste), reason: "requested_by_customer", metadata: { fermeture: p.fermetureId, facture: part.facture } },
        { idempotencyKey: `fermeture-${p.fermetureId}-remboursement-${part.facture}` }
      );
      faits.push({ facture: part.facture, remboursement: r.id, montant_cents: r.amount });
    } catch (e) {
      if (e instanceof ArretSupervision) throw e;
      if (dejaRembourseChezStripe(e)) { dejaRemboursees.push(part.facture); continue; }
      erreur = lireErreurStripe(e);
    }
  }
  return erreur ? { ok: false, erreur, faits, dejaRemboursees } : { ok: true, faits, dejaRemboursees };
}

type RemboursementDu = {
  id: string;
  remboursement_prevu_cents: number | string | null;
  remboursement_repartition: PartRemboursement[] | null;
  stripe_facture_id: string | null;
  /** Finitions du 24/10 : la souscription arrêtée, l'instant de l'arrêt prévu, une rétractation déjà exécutée dessus. */
  stripe_subscription_id?: string | null;
  arret_prevu_le?: string | null;
  retractation_executee?: boolean | null;
};

type SuiteAFaire = {
  id: string;
  account_id: string;
  origine: OrigineFermeture;
  choix: ChoixFermeture | null;
  adresse_courriel: string | null;
  demandee_le: string;
  derniere_activite_le: string | null;
  executee_le: string;
  mode_effacement: "suppression" | "neutralisation";
  bilan_execution: BilanFermeture & { fichiers_hors_documents?: { compartiment: string; chemin: string }[] };
  abonnement: AbonnementFermeture;
  remboursement_prevu_cents: number | string | null;
  remboursement_cents: number | string | null;
  rembourse_le: string | null;
  archives: { preuve_conservee_jusqu_au: string; factures_conservees_jusqu_au: string | null }[];
  remboursement_motif?: MotifRemboursementFermeture | null;
};

type AvertissementAEnvoyer = {
  account_id: string;
  email: string;
  etape: "j60" | "j15";
  nature: "organisation" | "personnel" | "artisan";
  organisation: string | null;
  titulaire: boolean | null;
  derniere_activite_le: string;
  suppression_le: string;
};

/** Seuls ces compartiments peuvent être vidés par les suites d'une fermeture (le compartiment `documents` passe par la file). */
const COMPARTIMENTS_SUITES = new Set(["artisan-prive", "exports-complets", "devis-preparations"]);

/** Un remboursement dû mais en échec ne retient pas le courriel de fin plus longtemps (l'adresse ne se garde pas sans fin). */
export const DELAI_COURRIEL_SANS_REMBOURSEMENT_JOURS = 7;

export type DependancesSuites = {
  stripe?: Stripe | null;
  envoyer?: typeof envoyerEmail;
  site?: string | null;
  versionMin?: string | null;
  avantEffet?: () => Promise<void>;
  /**
   * Avant chaque geste chez Stripe (remboursement, suppression d'un client), en plus d'`avantEffet` : l'arrêt
   * « Abonnements » le coupe aussi (finitions du 24/10, relecture transverse M1).
   */
  avantEffetStripe?: () => Promise<void>;
  /** Préparer les archives d'export en attente (faux dans les tests qui ne les visent pas). */
  exports?: boolean;
  maintenant?: Date;
};

export type BilanSuites = {
  courriels_fermeture: number;
  remboursements: number;
  /** Remboursements J+14 clos sans geste (rétractation, paiement déjà remboursé, souscription poursuivie). */
  remboursements_clos: number;
  avertissements: number;
  exports_supprimes: number;
  exports_prepares: number;
  clients_stripe_supprimes: number;
  echecs: number;
};

/** Un client déjà absent chez Stripe compte comme supprimé. */
function clientAbsent(e: unknown): boolean {
  const err = e as { code?: string; statusCode?: number };
  return err?.code === "resource_missing" || err?.statusCode === 404;
}

/**
 * Les suites des fermetures, les avertissements d'inactivité, le ménage des exports et les clients Stripe au terme, une
 * passe. Ordre : remboursements dus (dès l'arrêt chez Stripe, quel que soit le sort de la fermeture), puis, pour chaque
 * fermeture exécutée, fichiers hors `documents` et courriel de fin.
 */
export async function traiterSuitesComptes(db: SupabaseClient, d: DependancesSuites = {}): Promise<BilanSuites> {
  const envoyer = d.envoyer ?? envoyerEmail;
  const site = d.site === undefined ? adresseDuSite() : d.site;
  const avant = d.avantEffet ?? (async () => {});
  const avantStripe = async () => { await avant(); await d.avantEffetStripe?.(); };
  const maintenant = d.maintenant ?? new Date();
  const bilan: BilanSuites = { courriels_fermeture: 0, remboursements: 0, remboursements_clos: 0, avertissements: 0, exports_supprimes: 0, exports_prepares: 0, clients_stripe_supprimes: 0, echecs: 0 };
  const clore = async (id: string, motif: MotifRemboursementFermeture, faits: RemboursementFait[] = []) => {
    const { error } = await db.rpc("fermeture_remboursement_fait", { p_fermeture: id, p_faits: faits, p_motif: motif });
    if (error) bilan.echecs++;
    else bilan.remboursements_clos++;
  };

  // 1. Les archives d'export arrivées au terme de leurs sept jours.
  const menage = await supprimerExportsExpires(db, avant);
  bilan.exports_supprimes += menage.supprimes;
  bilan.echecs += menage.echecs;

  // 2. Les remboursements dus : la souscription est arrêtée chez Stripe (relecture du 24/10, I7).
  const { data: dus, error: lectureDus } = await db.rpc("fermetures_remboursements_dus", { p_limite: 20 });
  if (lectureDus) {
    bilan.echecs++;
  } else {
    for (const r of (dus ?? []) as RemboursementDu[]) {
      try {
        // I3 : une rétractation déjà exécutée sur cette souscription a remboursé la période en entier.
        if (r.retractation_executee) { await clore(r.id, "retractation"); continue; }
        if (!d.stripe) { bilan.echecs++; continue; }
        // I2 : la souscription doit s'être arrêtée à la date prévue. Arrêt levé ou reporté (elle a continué au-delà) :
        // rien n'est dû. Encore vivante chez Stripe (base en avance) : on attend la nuit suivante.
        if (r.stripe_subscription_id && r.arret_prevu_le) {
          let fin: { status?: string; ended_at?: number | null } | null = null;
          try {
            fin = (await d.stripe.subscriptions.retrieve(r.stripe_subscription_id)) as unknown as { status?: string; ended_at?: number | null };
          } catch (e) {
            if (e instanceof ArretSupervision || !clientAbsent(e)) throw e;
          }
          if (fin && !TERMINEE.has(fin.status ?? "")) continue;
          if (fin && typeof fin.ended_at === "number" && fin.ended_at * 1000 > Date.parse(r.arret_prevu_le) + MARGE_ARRET_MS) {
            await clore(r.id, "souscription_poursuivie");
            continue;
          }
        }
        const parts = (r.remboursement_repartition ?? []).map((p) => ({ facture: p.facture, montant_cents: Number(p.montant_cents) }));
        await avantStripe();
        const fait = await rembourserFermeture(d.stripe, { fermetureId: r.id, parts, avantEffet: avantStripe });
        if (!fait.ok) { bilan.echecs++; continue; }
        if (fait.faits.length === 0) { await clore(r.id, "deja_rembourse"); continue; }
        const { error: trace } = await db.rpc("fermeture_remboursement_fait", {
          p_fermeture: r.id, p_faits: fait.faits, p_motif: fait.dejaRemboursees.length > 0 ? "deja_rembourse" : null,
        });
        if (trace) { bilan.echecs++; continue; }
        bilan.remboursements++;
      } catch (e) {
        if (e instanceof ArretSupervision) throw e;
        bilan.echecs++;
      }
    }
  }

  // 3. Les fermetures exécutées dont les suites restent à faire.
  const { data: suites, error } = await db.rpc("fermetures_suites_a_faire", { p_limite: 20 });
  if (error) {
    bilan.echecs++;
  } else {
    for (const s of (suites ?? []) as SuiteAFaire[]) {
      try {
        // a. Fichiers hors du compartiment `documents`.
        const parCompartiment = new Map<string, string[]>();
        for (const f of s.bilan_execution?.fichiers_hors_documents ?? []) {
          if (!COMPARTIMENTS_SUITES.has(f.compartiment) || !f.chemin) continue;
          parCompartiment.set(f.compartiment, [...(parCompartiment.get(f.compartiment) ?? []), f.chemin]);
        }
        let fichiersRetires = true;
        for (const [compartiment, chemins] of parCompartiment) {
          await avant();
          const { error: retrait } = await db.storage.from(compartiment).remove(chemins);
          if (retrait) fichiersRetires = false;
        }
        if (!fichiersRetires) { bilan.echecs++; continue; }

        // b. Le remboursement dû (J+14) : fait par l'étape 2. Pas encore confirmé, le courriel attend la nuit suivante,
        //    sept jours au plus ; au-delà, il part en l'annonçant en cours (relecture du 24/10, M2).
        const prevu = Number(s.remboursement_prevu_cents ?? 0);
        const fait = s.rembourse_le ? Number(s.remboursement_cents ?? (s.remboursement_motif ? 0 : prevu)) : null;
        const enAttente = s.choix === "j14_prorata" && prevu > 0 && !s.rembourse_le;
        if (enAttente) {
          const jours = (maintenant.getTime() - new Date(s.executee_le).getTime()) / 86_400_000;
          // L'échec du remboursement est déjà compté par l'étape 2 ; attendre n'en est pas un.
          if (jours < DELAI_COURRIEL_SANS_REMBOURSEMENT_JOURS) continue;
        }

        // c. Le courriel de fin.
        if (s.adresse_courriel) {
          await avant();
          const html = corpsCompteFerme(
            {
              origine: s.origine,
              executeeLe: s.executee_le,
              demandeeLe: s.demandee_le,
              derniereActivite: s.derniere_activite_le,
              bilan: { ...s.bilan_execution, mode: s.mode_effacement },
              archives: s.archives ?? [],
              remboursementCents: fait && fait > 0 ? fait : null,
              remboursementEnCoursCents: enAttente ? prevu : null,
              remboursementMotif: s.remboursement_motif ?? null,
            },
            site ? `${site}/confidentialite` : null
          );
          const envoi = await envoyer({ to: s.adresse_courriel, subject: SUJET_COMPTE_FERME, html, cleIdempotence: `fermeture-${s.id}` });
          if (envoi.erreur) { bilan.echecs++; continue; }
        }
        const { error: fin } = await db.rpc("fermeture_suites_faites", {
          p_fermeture: s.id, p_remboursement_cents: null, p_stripe_remboursement_id: null, p_courriel_envoye: true,
        });
        if (fin) { bilan.echecs++; continue; }
        if (s.adresse_courriel) bilan.courriels_fermeture++;
      } catch (e) {
        if (e instanceof ArretSupervision) throw e;
        bilan.echecs++;
      }
    }
  }

  // 4. Les avertissements d'inactivité (règle active seulement avec une version des conditions désignée).
  const version = d.versionMin === undefined ? VERSION_MIN_INACTIVITE : d.versionMin;
  if (versionInactiviteValide(version)) {
    const { data: aPrevenir, error: lecture } = await db.rpc("comptes_inactifs_a_prevenir", { p_version_min: version, p_limite: 100 });
    if (lecture) {
      bilan.echecs++;
    } else {
      for (const a of (aPrevenir ?? []) as AvertissementAEnvoyer[]) {
        try {
          await avant();
          const html = corpsAvertissementInactivite({
            etape: a.etape,
            nature: a.nature,
            organisation: a.organisation,
            titulaire: a.titulaire ?? undefined,
            derniereActivite: a.derniere_activite_le,
            suppressionLe: a.suppression_le,
            lienArchive: site ? `${site}/compte/donnees#archive` : null,
            lienExportArtisan: site ? `${site}/api/artisan-prive/export` : null,
          });
          const envoi = await envoyer({
            to: a.email,
            subject: sujetAvertissementInactivite({ etape: a.etape, suppressionLe: a.suppression_le }),
            html,
            cleIdempotence: `inactivite-${a.account_id}-${a.etape}-${a.suppression_le}`,
          });
          if (envoi.erreur) { bilan.echecs++; continue; }
          const { error: trace } = await db.rpc("avertissement_inactivite_envoye", {
            p_account: a.account_id, p_etape: a.etape, p_derniere_activite_le: a.derniere_activite_le, p_suppression_le: a.suppression_le,
          });
          if (trace) { bilan.echecs++; continue; }
          bilan.avertissements++;
        } catch (e) {
          if (e instanceof ArretSupervision) throw e;
          bilan.echecs++;
        }
      }
    }
  }

  // 5. Les clients Stripe arrivés au terme de leurs factures (six ans après la plus récente ; relecture du 24/10, R2-5).
  if (d.stripe) {
    const { data: clients, error: lectureClients } = await db.rpc("clients_stripe_au_terme", { p_limite: 50 });
    if (lectureClients) {
      bilan.echecs++;
    } else {
      for (const { stripe_customer_id: client } of (clients ?? []) as { stripe_customer_id: string }[]) {
        try {
          await avantStripe();
          try {
            await d.stripe.customers.del(client);
          } catch (e) {
            if (e instanceof ArretSupervision || !clientAbsent(e)) throw e;
          }
          const { error: trace } = await db.rpc("client_stripe_supprime", { p_customer: client });
          if (trace) { bilan.echecs++; continue; }
          bilan.clients_stripe_supprimes++;
        } catch (e) {
          if (e instanceof ArretSupervision) throw e;
          bilan.echecs++;
        }
      }
    }
  }

  // 6. Les archives demandées dont la préparation immédiate n'a pas abouti (fonction coupée) : une par passe.
  if (d.exports !== false) {
    const prep = await construireExportsEnAttente(db, avant, 1);
    bilan.exports_prepares += prep.prepares;
    bilan.echecs += prep.echecs;
  }
  return bilan;
}
