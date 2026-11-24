// La garde de souscription (lot B3, 19/10/2026) : ce qui doit être vrai AVANT
// d'ouvrir un paiement, en plus des clés Stripe et du régime de TVA.
//
// Deux conditions de contrat, vérifiées par le serveur (actions/abonnement.ts)
// et dites par l'écran (abonnement-2026.tsx, formulaire-souscription.tsx) avec
// les MÊMES phrases :
//  1. le vendeur est identifié — les faits requis de lib/editeur.ts, lus dans
//     `supervision_identite` par-dessus le code (lib/editeur-serveur.ts), et
//     la mention « EI » accolée au nom d'un entrepreneur individuel.
//     Pour TOUTE première souscription (particulier ou agence), ce contrôle
//     ne se lève pas : pas de vente sans vendeur identifié (décision du
//     dirigeant du 24/11/2026, Q7 ; relecture D7R-04 pour l'agence). Le
//     superadmin peut le lever depuis les paramètres pour une hausse de
//     capacité seulement ; le serveur lit cette décision en base.
//  1 bis. le médiateur de la consommation est désigné — pour la première
//     souscription d'un PARTICULIER seulement, et PAR DÉFAUT. Reprise du
//     24/11/2026 (décision de pilotage) : le recueil fourni par le dirigeant
//     contient les articles L. 612-1 et L. 616-1 du code de la consommation
//     (le professionnel garantit au consommateur le recours effectif à une
//     médiation et lui communique les coordonnées du médiateur). Le superadmin
//     peut ouvrir quand même aux particuliers en levant le blocage, en
//     connaissance de cause (l'écran de console cite ces deux articles) ; la
//     levée est inscrite à l'historique. Un professionnel n'est pas concerné.
//  2. le compte qui clique a accepté LA VERSION EN VIGUEUR des conditions
//     générales (`acceptations_cgu`, ajout seul). Exigée pour la souscription
//     initiale seulement (arbitrage du 19/10) : une hausse de capacité porte
//     sur un contrat déjà formé.
//
// Ce module n'importe rien du serveur : le formulaire client et les tests
// l'utilisent tel quel. Les lectures en base vivent dans
// lib/garde-souscription-serveur.ts.

import { CONDITIONS_VERSION, defautsVendeur, mediateurDesigne, type FaitEditeur } from "@/lib/editeur";

/**
 * Le refus tant que les mentions légales de l'éditeur manquent. Même phrase
 * dans l'action et à l'écran. Elle commence comme les motifs Stripe et TVA
 * (« Le paiement en ligne n'est pas encore ouvert », apostrophe droite comme
 * eux : le parcours local e2e/abonnement.spec.ts s'y accroche) et ne prend
 * aucune des formes que la recette relève comme une erreur d'écran
 * (e2e/recette-production/outils.ts, MESSAGES_D_ERREUR) : la recette la lit
 * telle quelle, par son texte exact.
 *
 * Correction du 19/10 : la phrase est servie SANS « Votre essai continue. »
 * dès que l'essai ne court plus — compte gelé en lecture seule à la fin de
 * l'essai, ou client déjà abonné qui demande une hausse.
 */
export const MOTIF_IDENTITE_EDITEUR =
  "Le paiement en ligne n'est pas encore ouvert : les mentions légales de l'éditeur sont en cours de publication.";

/** La même phrase pendant l'essai : il continue, rien n'est perdu. */
export const MOTIF_IDENTITE_EDITEUR_ESSAI = `${MOTIF_IDENTITE_EDITEUR} Votre essai continue.`;

/** Le refus tant que le compte n'a pas accepté la version en vigueur des conditions. */
export const MOTIF_CONDITIONS_A_ACCEPTER = "Acceptez la version en vigueur des conditions générales avant de poursuivre.";

/** Quand la version lue à l'écran n'est plus celle du serveur (page restée ouverte pendant un déploiement). */
export const ERREUR_CONDITIONS_PERIMEES =
  "Les conditions ont changé depuis l’affichage : rechargez la page, puis acceptez la version en vigueur.";

/** Même phrase qu'à l'ouverture d'un espace propriétaire (actions/auth.ts). */
export const ERREUR_ACCEPTATION_CONDITIONS =
  "L’acceptation des conditions n’a pas pu être enregistrée. Réessayez dans un instant.";

/**
 * L'état du compte qui lit le motif. `enEssai` est vrai quand l'essai COURT
 * encore : statut « essai » ET écriture ouverte. Un essai arrivé à son terme
 * garde le statut « essai » (public.org_ecriture_ouverte ferme à la date,
 * sans changement de statut) : il n'est plus « en essai » au sens de cette
 * phrase.
 */
export type ContexteGarde = {
  enEssai: boolean;
  /** `false` seulement si le superadmin a levé le blocage (lu en base) ; absent ou illisible : actif. */
  blocageIdentiteActif?: boolean;
  /** Vrai pour toute première souscription, quel que soit le client : le vendeur doit être identifié, blocage levé ou non. */
  premiereSouscription?: boolean;
  /** Vrai pour la première souscription d'un particulier (tarif « propriétaire ») : elle est aussi une première souscription. */
  nouvelleSouscriptionParticulier?: boolean;
};

/**
 * Le refus fait au particulier tant qu'aucun médiateur de la consommation n'est saisi (phrase d'avant le lot D7,
 * rétablie). Elle commence comme les autres motifs (« Le paiement en ligne n'est pas encore ouvert ») et ne dit pas
 * qu'un médiateur existe.
 */
export const MOTIF_MEDIATEUR =
  "Le paiement en ligne n'est pas encore ouvert aux particuliers. Les coordonnées du médiateur de la consommation de Gerimmo doivent être publiées avant la première souscription.";

/**
 * Le motif qui ferme le paiement, ou `null`.
 *  - Vendeur incomplet : ferme toute première souscription, blocage levé ou non ; ferme une hausse tant que le blocage
 *    est actif. Le détail des manques n'est pas dit au client : il est affiché au dirigeant (/admin/sante,
 *    /admin/parametres).
 *  - Médiateur non saisi : ferme la première souscription d'un particulier tant que le blocage est actif.
 * Pendant l'essai, la phrase ajoute « Votre essai continue. » ; gelé ou abonné, elle s'arrête avant.
 */
export function motifIdentiteEditeur(editeur: Record<string, FaitEditeur>, { enEssai, blocageIdentiteActif, premiereSouscription, nouvelleSouscriptionParticulier }: ContexteGarde): string | null {
  const blocageLeve = blocageIdentiteActif === false;
  const premiere = Boolean(premiereSouscription || nouvelleSouscriptionParticulier);
  if ((!blocageLeve || premiere) && defautsVendeur(editeur).length > 0) {
    return enEssai ? MOTIF_IDENTITE_EDITEUR_ESSAI : MOTIF_IDENTITE_EDITEUR;
  }
  if (nouvelleSouscriptionParticulier && !blocageLeve && !mediateurDesigne(editeur)) {
    return enEssai ? `${MOTIF_MEDIATEUR} Votre essai continue.` : MOTIF_MEDIATEUR;
  }
  return null;
}

/** Vrai si la valeur est la version en vigueur — égalité stricte, jamais une comparaison d'ordre. */
export function estLaVersionEnVigueur(version: unknown): boolean {
  return version === CONDITIONS_VERSION;
}
