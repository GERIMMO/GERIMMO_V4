// Décision D24-C du dirigeant (14/10/2026, fiches ARC-07 et ARC-04), à livrer avant toute activation du module
// « clients externes » (il reste désactivé en production) : une facture externe déposée avec une erreur s'annule par
// une action MOTIVÉE qui émet un AVOIR NUMÉROTÉ du même montant ; une nouvelle facture peut ensuite être déposée sur le
// chantier. Rien n'est supprimé : la facture annulée reste lisible avec son avoir, dans le registre et dans l'export, et
// son numéro reste réservé (il ne sert jamais à une autre facture).
//
// La base (migration 20261014710000) refuse et rend ces mêmes textes ; l'écran et l'action serveur les reprennent d'ici.
// Une seule rédaction : tests/artisan-avoir-facture-externe.test.ts compare les deux.
//
// Ce module ne lit aucun montant saisi : l'avoir reprend le total TTC de la facture, déjà enregistré en centimes.

/** Aligné sur la base (artisan_externe_ecrire, action « annuler_facture », et la contrainte du motif de l'avoir). */
export const MOTIF_ANNULATION_MIN = 10;
export const MOTIF_ANNULATION_MAX = 4000;

export const MESSAGE_MOTIF_ANNULATION =
  "Expliquez pourquoi la facture est annulée (10 caractères au moins) : ce motif est enregistré avec l’avoir, dans votre registre.";

export const MESSAGE_FACTURE_A_RELIRE =
  "Cette facture n’est plus celle du chantier. Rechargez la page avant de recommencer.";

export const MESSAGE_FACTURE_DEJA_ANNULEE =
  "Cette facture est déjà annulée par un avoir. Rechargez la page pour voir l’avoir et, si besoin, déposer la facture qui la remplace.";

export const MESSAGE_REGLEMENTS_A_ANNULER =
  "Des règlements sont déclarés sur cette facture : annulez d’abord ces déclarations depuis le suivi de la facture, puis annulez la facture.";

/** Refus d'un règlement déclaré sur une facture annulée (artisan_reglement_ecrire). */
export const MESSAGE_REGLEMENT_FACTURE_ANNULEE =
  "Cette facture est annulée par un avoir : aucun règlement ne peut plus y être déclaré. Déclarez-le sur la facture qui la remplace.";

/**
 * Relecture du 15/10 : Gerimmo ne produit AUCUN document d'avoir (ni PDF, ni lien de téléchargement) ; l'avoir est une ligne
 * du registre privé (TTC seul). Aucun texte ne doit laisser croire qu'il existe une pièce à remettre au client. La forme de
 * l'avoir remis au client (pièce produite par Gerimmo, ou avoir émis par l'outil de l'artisan et déclaré ici) relève de l'avis
 * de l'expert-comptable que la décision D24 demande avant d'activer le module : non tranché, rien n'est promis ici.
 */
export const MESSAGE_AVOIR_SANS_PIECE =
  "Cet avoir n’existe que dans votre registre Gerimmo et dans son export : Gerimmo ne produit pas de document d’avoir à remettre à votre client et ne lui envoie rien.";

/** Le bouton du second temps : l'avoir est enregistré dans le registre, il n'est pas « émis » vers le client. */
export const LIBELLE_CONFIRMER_ANNULATION = "Confirmer l’annulation et enregistrer l’avoir";

/** Ce que l'artisan lit avant de confirmer : ce qui sera enregistré, ce qui reste, ce qui ne se défait pas. */
export const MESSAGE_ANNULATION_CONSEQUENCES =
  "Gerimmo enregistre un avoir du même montant, lié à cette facture, avec le numéro suivant de vos avoirs (attribué à la confirmation). La facture reste visible dans votre registre et dans l’export, avec son avoir. Son numéro reste réservé : la facture qui la remplace devra porter un autre numéro. Cette annulation est définitive. " +
  MESSAGE_AVOIR_SANS_PIECE;

export type EntreesAnnulationFacture = {
  /** Le numéro de la facture à annuler, tel qu'il est enregistré. */
  numero: string;
  /** Le total TTC de la facture, en centimes : l'avoir l'annule en entier. */
  montantCents: number;
  /** Le motif tel que l'artisan l'a tapé. */
  motif: string;
};

export type ResumeAnnulationFacture = {
  numero: string;
  montantCents: number;
  /** Tel qu'il sera enregistré : les espaces de bord sont retirés. */
  motif: string;
  /** Ce qui empêche la confirmation : l'écran le dit et ne propose alors que de corriger. */
  alertes: string[];
  pret: boolean;
};

/** Ce que l'écran de confirmation montre avant l'annulation d'une facture externe, et ce qui la bloque. */
export function resumerAnnulation(entrees: EntreesAnnulationFacture): ResumeAnnulationFacture {
  const motif = entrees.motif.trim();
  // La base compte les caractères (length) : les lettres accentuées comptent pour un, comme ici.
  const longueur = [...motif].length;
  const alertes: string[] = [];
  if (longueur < MOTIF_ANNULATION_MIN || longueur > MOTIF_ANNULATION_MAX) alertes.push(MESSAGE_MOTIF_ANNULATION);
  return { numero: entrees.numero, montantCents: entrees.montantCents, motif, alertes, pret: alertes.length === 0 };
}

/** Un avoir tel que la lecture de l'espace privé le rend (mon_activite_artisan_privee, clé `avoirs`). */
export type AvoirArtisan = {
  id: string;
  facture_id: string;
  facture_numero: string;
  chantier_id: string;
  rang: number;
  numero: string;
  montant_ttc_cents: number;
  motif: string;
  /** Le jour d'émission, à Paris (AAAA-MM-JJ). */
  jour: string;
  auteur: string;
  created_at: string;
};

/** L'avoir qui annule cette facture, s'il existe. Une base pas encore migrée ne rend pas la clé : aucun avoir. */
export function avoirDeLaFacture(factureId: string, avoirs: AvoirArtisan[] | undefined): AvoirArtisan | null {
  return (avoirs ?? []).find((a) => a.facture_id === factureId) ?? null;
}
