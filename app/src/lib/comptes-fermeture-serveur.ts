import "server-only";
// LES GESTES DE LA FERMETURE DES COMPTES (plan de conformité du 23/10/2026, lot 1E : R14, R15, R51).
//
// La base décide et efface (migration 20261024130000 : programmer_fermeture_compte, executer_fermeture_compte, tâche
// pg_cron « fermetures-comptes » de 3 h 20 UTC). Ici, ce qu'elle ne peut pas faire :
//  · chez Stripe, AVANT la programmation : arrêter la souscription à la date d'effet (fin de la période payée, ou J+14
//    avec un remboursement au prorata calculé sur la dernière facture payée) — et le défaire si la fermeture est
//    annulée ;
//  · APRÈS l'exécution (mission « purge », 3 h 40 UTC) : retirer les fichiers hors du compartiment `documents`
//    (registres privés d'artisan, archives d'export), rembourser la part non utilisée, envoyer « Votre compte Gerimmo
//    est fermé » ;
//  · chaque nuit : envoyer les avertissements d'inactivité J-60 et J-15 (règle active seulement quand
//    VERSION_MIN_INACTIVITE est posée), supprimer les archives d'export de plus de sept jours, préparer les archives
//    demandées que leur préparation immédiate n'a pas terminées.
// Le client Stripe n'est jamais supprimé, les factures restent chez Stripe.

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArretSupervision } from "@/lib/controle-effets";
import { envoyerEmail } from "@/lib/email";
import { adresseDuSite } from "@/lib/site";
import { libererEcheancierDe, resilierAEcheance } from "@/lib/stripe-offres";
import { lireErreurStripe } from "@/lib/stripe";
import {
  SUJET_COMPTE_FERME,
  VERSION_MIN_INACTIVITE,
  corpsAvertissementInactivite,
  corpsCompteFerme,
  jourParisPlus,
  minuitParisEnSecondes,
  remboursementProrata,
  sujetAvertissementInactivite,
  versionInactiviteValide,
  type BilanFermeture,
  type ChoixFermeture,
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
};

export type PreparationStripe =
  | { ok: true; remboursement: { facture: string; montant_cents: number } | null; arret: string | null }
  | { ok: false; erreur: string };

/**
 * Arrête la souscription à la date d'effet de la fermeture, AVANT de la programmer en base :
 *  · abonnement payé en cours, fin de période : résiliation à l'échéance (l'échéancier éventuel est libéré) ;
 *  · abonnement payé en cours, J+14 : arrêt à minuit (heure de Paris) du quatorzième jour, sans avoir au prorata chez
 *    Stripe, et montant du remboursement de la part non utilisée calculé sur la dernière facture payée ;
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
  if (!abo.vivante || !sub) return { ok: true, remboursement: null, arret: null };
  try {
    if (abo.payee_en_cours && choix === "fin_periode") {
      const r = await resilierAEcheance(stripe, { subscription: sub, resilier: true });
      return r.ok ? { ok: true, remboursement: null, arret: abo.periode_fin ?? null } : { ok: false, erreur: r.erreur };
    }
    if (abo.payee_en_cours && choix !== "j14_prorata") {
      return { ok: false, erreur: "Un abonnement payé est en cours : choisissez la fin de la période payée ou une fermeture à quatorze jours avec remboursement." };
    }
    const libere = await libererEcheancierDe(stripe, sub);
    if (!libere.ok) return { ok: false, erreur: libere.erreur };
    const arret = minuitParisEnSecondes(jourParisPlus(maintenant, 14));
    await stripe.subscriptions.update(sub, { cancel_at: arret, proration_behavior: "none" });
    if (!abo.payee_en_cours) return { ok: true, remboursement: null, arret: new Date(arret * 1000).toISOString() };
    const factures = await stripe.invoices.list({ subscription: sub, status: "paid", limit: 1 });
    const facture = factures.data[0];
    if (!facture?.id || !abo.periode_debut || !abo.periode_fin) {
      return { ok: true, remboursement: null, arret: new Date(arret * 1000).toISOString() };
    }
    const montant = remboursementProrata({
      payeCents: facture.amount_paid ?? 0,
      debut: new Date(abo.periode_debut),
      fin: new Date(abo.periode_fin),
      arret: new Date(arret * 1000),
    });
    return {
      ok: true,
      remboursement: montant > 0 ? { facture: facture.id, montant_cents: montant } : null,
      arret: new Date(arret * 1000).toISOString(),
    };
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    return { ok: false, erreur: lireErreurStripe(e) };
  }
}

/** Défait l'arrêt posé par preparerStripeFermeture (fermeture annulée, ou programmation refusée par la base). */
export async function annulerStripeFermeture(
  stripe: Stripe,
  abo: AbonnementFermeture,
  choix: ChoixFermeture | null
): Promise<{ ok: true } | { ok: false; erreur: string }> {
  const sub = abo.stripe_subscription_id;
  if (!abo.vivante || !sub) return { ok: true };
  try {
    if (abo.payee_en_cours && choix === "fin_periode") {
      const r = await resilierAEcheance(stripe, { subscription: sub, resilier: false });
      return r.ok ? { ok: true } : { ok: false, erreur: r.erreur };
    }
    await stripe.subscriptions.update(sub, { cancel_at: "" });
    return { ok: true };
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    return { ok: false, erreur: lireErreurStripe(e) };
  }
}

/** Le remboursement de la part non utilisée, sur le paiement de la facture : une seule fois (clé d'idempotence). */
export async function rembourserFermeture(
  stripe: Stripe,
  p: { fermetureId: string; factureId: string; montantCents: number }
): Promise<{ ok: true; id: string; montant: number } | { ok: false; erreur: string }> {
  if (!Number.isSafeInteger(p.montantCents) || p.montantCents <= 0) return { ok: false, erreur: "Montant de remboursement invalide." };
  try {
    const paiements = await stripe.invoicePayments.list({ invoice: p.factureId, status: "paid", limit: 1 });
    const paiement = paiements.data[0]?.payment;
    const intention = typeof paiement?.payment_intent === "string" ? paiement.payment_intent : paiement?.payment_intent?.id;
    const charge = typeof paiement?.charge === "string" ? paiement.charge : paiement?.charge?.id;
    if (!intention && !charge) return { ok: false, erreur: "Paiement de la facture introuvable chez Stripe." };
    const remboursement = await stripe.refunds.create(
      {
        ...(intention ? { payment_intent: intention } : { charge }),
        amount: p.montantCents,
        reason: "requested_by_customer",
        metadata: { fermeture: p.fermetureId },
      },
      { idempotencyKey: `fermeture-${p.fermetureId}-remboursement` }
    );
    return { ok: true, id: remboursement.id, montant: remboursement.amount };
  } catch (e) {
    if (e instanceof ArretSupervision) throw e;
    return { ok: false, erreur: lireErreurStripe(e) };
  }
}

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
  stripe_facture_id: string | null;
  rembourse_le: string | null;
  archives: { preuve_conservee_jusqu_au: string; factures_conservees_jusqu_au: string | null }[];
};

type AvertissementAEnvoyer = {
  account_id: string;
  email: string;
  etape: "j60" | "j15";
  nature: "organisation" | "personnel";
  organisation: string | null;
  derniere_activite_le: string;
  suppression_le: string;
};

/** Seuls ces compartiments peuvent être vidés par les suites d'une fermeture (le compartiment `documents` passe par la file). */
const COMPARTIMENTS_SUITES = new Set(["artisan-prive", "exports-complets"]);

export type DependancesSuites = {
  stripe?: Stripe | null;
  envoyer?: typeof envoyerEmail;
  site?: string | null;
  versionMin?: string | null;
  avantEffet?: () => Promise<void>;
  /** Préparer les archives d'export en attente (faux dans les tests qui ne les visent pas). */
  exports?: boolean;
};

export type BilanSuites = {
  courriels_fermeture: number;
  remboursements: number;
  avertissements: number;
  exports_supprimes: number;
  exports_prepares: number;
  echecs: number;
};

/** Les suites des fermetures exécutées, les avertissements d'inactivité et le ménage des exports, une passe. */
export async function traiterSuitesComptes(db: SupabaseClient, d: DependancesSuites = {}): Promise<BilanSuites> {
  const envoyer = d.envoyer ?? envoyerEmail;
  const site = d.site === undefined ? adresseDuSite() : d.site;
  const avant = d.avantEffet ?? (async () => {});
  const bilan: BilanSuites = { courriels_fermeture: 0, remboursements: 0, avertissements: 0, exports_supprimes: 0, exports_prepares: 0, echecs: 0 };

  // 1. Les archives d'export arrivées au terme de leurs sept jours.
  const menage = await supprimerExportsExpires(db, avant);
  bilan.exports_supprimes += menage.supprimes;
  bilan.echecs += menage.echecs;

  // 2. Les fermetures exécutées dont les suites restent à faire.
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

        // b. Le remboursement de la part non utilisée (J+14).
        let rembourse: number | null = null;
        const prevu = Number(s.remboursement_prevu_cents ?? 0);
        if (s.choix === "j14_prorata" && prevu > 0 && s.stripe_facture_id && !s.rembourse_le) {
          if (!d.stripe) { bilan.echecs++; continue; }
          await avant();
          const r = await rembourserFermeture(d.stripe, { fermetureId: s.id, factureId: s.stripe_facture_id, montantCents: prevu });
          if (!r.ok) { bilan.echecs++; continue; }
          const { error: trace } = await db.rpc("fermeture_suites_faites", {
            p_fermeture: s.id, p_remboursement_cents: r.montant, p_stripe_remboursement_id: r.id, p_courriel_envoye: false,
          });
          if (trace) { bilan.echecs++; continue; }
          rembourse = r.montant;
          bilan.remboursements++;
        } else if (s.rembourse_le && prevu > 0) {
          rembourse = prevu;
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
              remboursementCents: rembourse,
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

  // 3. Les avertissements d'inactivité (règle active seulement avec une version des conditions désignée).
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
            derniereActivite: a.derniere_activite_le,
            suppressionLe: a.suppression_le,
            lienArchive: site ? `${site}/compte/donnees#archive` : null,
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

  // 4. Les archives demandées dont la préparation immédiate n'a pas abouti (fonction coupée) : une par passe.
  if (d.exports !== false) {
    const prep = await construireExportsEnAttente(db, avant, 1);
    bilan.exports_prepares += prep.prepares;
    bilan.echecs += prep.echecs;
  }
  return bilan;
}
