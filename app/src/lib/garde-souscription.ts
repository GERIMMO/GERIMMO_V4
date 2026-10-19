// La garde de souscription (lot B3, 19/10/2026) : ce qui doit être vrai AVANT
// d'ouvrir un paiement, en plus des clés Stripe et du régime de TVA.
//
// Deux conditions de contrat, vérifiées par le serveur (actions/abonnement.ts)
// et dites par l'écran (abonnement-2026.tsx, formulaire-souscription.tsx) avec
// les MÊMES phrases :
//  1. l'identité de l'éditeur est complète — les huit faits requis de
//     lib/editeur.ts, lus dans `supervision_identite` par-dessus le code
//     (lib/editeur-serveur.ts). Un contrat dont une partie n'est pas nommée
//     n'engage personne : tant qu'un fait manque, aucun paiement, ni
//     souscription ni hausse ;
//  2. le compte qui clique a accepté LA VERSION EN VIGUEUR des conditions
//     générales (`acceptations_cgu`, ajout seul). Exigée pour la souscription
//     initiale seulement (arbitrage du 19/10) : une hausse de capacité porte
//     sur un contrat déjà formé.
//
// Ce module n'importe rien du serveur : le formulaire client et les tests
// l'utilisent tel quel. Les lectures en base vivent dans
// lib/garde-souscription-serveur.ts.

import { CONDITIONS_VERSION, faitsManquants, type FaitEditeur } from "@/lib/editeur";

/**
 * Le refus tant que les mentions légales de l'éditeur manquent. Même phrase
 * dans l'action et à l'écran. Elle commence comme les motifs Stripe et TVA
 * (« Le paiement en ligne n'est pas encore ouvert ») et ne prend aucune des
 * formes que la recette relève comme une erreur d'écran
 * (e2e/recette-production/outils.ts, MESSAGES_D_ERREUR) : la recette la lit
 * telle quelle, par son texte exact.
 */
export const MOTIF_IDENTITE_EDITEUR =
  "Le paiement en ligne n’est pas encore ouvert : les mentions légales de l’éditeur sont en cours de publication. Votre essai continue.";

/** Le refus tant que le compte n'a pas accepté la version en vigueur des conditions. */
export const MOTIF_CONDITIONS_A_ACCEPTER = "Acceptez la version en vigueur des conditions générales avant de poursuivre.";

/** Quand la version lue à l'écran n'est plus celle du serveur (page restée ouverte pendant un déploiement). */
export const ERREUR_CONDITIONS_PERIMEES =
  "Les conditions ont changé depuis l’affichage : rechargez la page, puis acceptez la version en vigueur.";

/** Même phrase qu'à l'ouverture d'un espace propriétaire (actions/auth.ts). */
export const ERREUR_ACCEPTATION_CONDITIONS =
  "L’acceptation des conditions n’a pas pu être enregistrée. Réessayez dans un instant.";

/**
 * Le motif qui ferme le paiement, ou `null` si l'identité est complète. Le
 * détail des faits manquants n'est pas dit au client : il est déjà affiché au
 * dirigeant (/admin/sante, /admin/parametres).
 */
export function motifIdentiteEditeur(editeur: Record<string, FaitEditeur>): string | null {
  return faitsManquants(editeur).length > 0 ? MOTIF_IDENTITE_EDITEUR : null;
}

/** Vrai si la valeur est la version en vigueur — égalité stricte, jamais une comparaison d'ordre. */
export function estLaVersionEnVigueur(version: unknown): boolean {
  return version === CONDITIONS_VERSION;
}
