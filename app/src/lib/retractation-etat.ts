// L'ÉTAT DU DROIT DE RÉTRACTATION (plan de conformité du 23/10/2026, R01 et R37), calculé une fois pour l'écran
// « Mon abonnement », la page de déclaration et l'action serveur, depuis la ligne de `ma_retractation`.
// Module pur : la date limite vient de lib/delai-retractation.ts.

import { dernierJourRetractation, retractationOuverte } from "@/lib/delai-retractation";

/** Une ligne de `ma_retractation` (migration 20261024110000). */
export type LigneRetractation = {
  souscrit_le: string | null;
  abonnement_suivi: boolean;
  stripe_statut: string | null;
  essai_fin: string | null;
  periodicite: "mensuel" | "annuel";
  periodicite_suivante: "mensuel" | "annuel" | null;
  passage_annuel_demande_le: string | null;
  formule: string | null;
  organisation: string;
  destinataire: string | null;
  retractation_abonnement_le: string | null;
  retractation_passage_le: string | null;
  /** La déclaration de passage exécutée : le passage était-il déjà effectué ? (null avant l'exécution) */
  retractation_passage_effectue?: boolean | null;
};

export type DroitRetractation = {
  /** Le délai court encore et aucune déclaration n'est enregistrée. */
  ouverte: boolean;
  /** Le point de départ : souscription, ou demande de passage à l'annuel. */
  conclusion: Date | null;
  /** Le dernier jour du délai (AAAA-MM-JJ, jour de Paris), ou null. */
  dernierJour: string | null;
  /** Une déclaration déjà enregistrée, son instant. */
  declareeLe: string | null;
};

export type EtatRetractation = {
  abonnement: DroitRetractation;
  passage: DroitRetractation & { effectue: boolean };
};

const FERME: DroitRetractation = { ouverte: false, conclusion: null, dernierJour: null, declareeLe: null };

/**
 * `conclusionStripe` : la date de souscription relue chez Stripe quand la base ne la connaît pas encore (souscription
 * antérieure au 24/10, que le webhook n'a pas encore datée).
 */
export function etatRetractation(l: LigneRetractation | null, maintenant = new Date(), conclusionStripe: Date | null = null): EtatRetractation {
  if (!l || !l.abonnement_suivi) return { abonnement: FERME, passage: { ...FERME, effectue: false } };
  const souscrit = l.souscrit_le ? new Date(l.souscrit_le) : conclusionStripe;
  const abonnement: DroitRetractation = souscrit
    ? {
        ouverte: !l.retractation_abonnement_le && retractationOuverte(souscrit, maintenant),
        conclusion: souscrit,
        dernierJour: dernierJourRetractation(souscrit),
        declareeLe: l.retractation_abonnement_le,
      }
    : { ...FERME, declareeLe: l.retractation_abonnement_le };
  // Le passage à l'annuel : programmé (mensuel, suivante annuelle) ou effectué (annuel), avec sa demande datée.
  // Relecture adverse du 24/10 (point 1) : une déclaration déjà enregistrée garde son droit (sa reprise reste possible)
  // même quand la périodicité a changé depuis — retour au mensuel fait par une première exécution, passage retiré.
  // « Effectué » vient alors de l'exécution consignée, quand elle l'est.
  const demande = l.passage_annuel_demande_le ? new Date(l.passage_annuel_demande_le) : null;
  const programme = l.periodicite === "mensuel" && l.periodicite_suivante === "annuel";
  const effectue = l.retractation_passage_effectue ?? l.periodicite === "annuel";
  const passage =
    demande && (programme || effectue || l.retractation_passage_le) && !l.retractation_abonnement_le
      ? {
          ouverte: !l.retractation_passage_le && retractationOuverte(demande, maintenant),
          conclusion: demande,
          dernierJour: dernierJourRetractation(demande),
          declareeLe: l.retractation_passage_le,
          effectue,
        }
      : { ...FERME, declareeLe: l.retractation_passage_le, effectue };
  return { abonnement, passage };
}
