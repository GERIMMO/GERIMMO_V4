import type { ModeleSignature } from "./politique-signature";

/**
 * Décision du dirigeant du 24/11/2026 (Q11) et relecture du même jour (constats B1 et B2).
 *
 * La signature électronique est proposée EN PREMIER, mais seulement à qui peut vraiment s'en servir aujourd'hui.
 * Pour chaque modèle de document, l'écran connaît donc l'état de la voie électronique :
 *
 *  · « ouverte »        le propriétaire direct peut envoyer ce document en signature : bouton plein, placé en premier ;
 *  · « en_preparation » le service n'est pas ouvert (réglage fait à la publication) : le papier est la voie qui
 *                       fonctionne ; le bouton électronique vient après, en contour, et dit « en préparation » ;
 *  · « suspendue »      les NOUVEAUX envois de CE modèle sont fermés (acte de cautionnement) : même présentation. Un
 *                       envoi déjà parti continue d'être suivi par le même bouton (le panneau lève la fermeture pour
 *                       un circuit en préparation, en cours ou à vérifier). L'écran ne sait pas si un envoi est parti :
 *                       ses textes sont donc écrits pour être vrais dans les deux cas (relecture du 24/11, M-d) ;
 *  · « non_proposee »   agence, ou personne qui ne peut pas demander la signature : l'écran reste celui d'AVANT la
 *                       décision (rien n'est retiré, rien n'est promis).
 *
 * Cet état est calculé côté serveur (lib/signature-ouverture.ts, qui lit les réglages) et donné aux écrans par la mise
 * en page de l'espace (components/voies-signature.tsx). Ce fichier-ci ne lit aucun réglage : le navigateur peut l'importer.
 */
export type VoieElectronique = "ouverte" | "en_preparation" | "suspendue" | "non_proposee";
export type VoiesSignature = Record<ModeleSignature, VoieElectronique>;

/** Sans information du serveur (composant rendu seul) : l'écran d'avant, qui ne promet rien. */
export const VOIES_NON_PROPOSEES: VoiesSignature = {
  bail: "non_proposee", devis_artisan: "non_proposee", avenant: "non_proposee", cautionnement: "non_proposee",
  edl: "non_proposee", protocole_apurement: "non_proposee", autorisation_travaux: "non_proposee",
};

export const LIBELLE_SIGNATURE_ELECTRONIQUE = "Signature électronique";

/** Le nom du bouton qui ouvre la signature électronique d'un document. */
export function libelleBoutonSignature(voie: VoieElectronique): string {
  if (voie === "ouverte") return LIBELLE_SIGNATURE_ELECTRONIQUE;
  if (voie === "en_preparation") return `${LIBELLE_SIGNATURE_ELECTRONIQUE} (en préparation)`;
  if (voie === "suspendue") return `${LIBELLE_SIGNATURE_ELECTRONIQUE} (nouveaux envois suspendus)`;
  return "Signature Zoho · SMS"; // le libellé d'avant la décision, inchangé pour l'agence
}

export const PAPIER_TOUJOURS_POSSIBLE = "La signature sur papier reste toujours possible";

/**
 * La phrase qui présente les deux voies, dans l'ordre où l'écran les montre. `papier` dit comment faire sur papier à
 * cet endroit (« déposez le contrat signé… »). Rien pour l'agence : son écran est celui d'avant.
 */
export function phraseVoiesSignature(voie: VoieElectronique, papier: string): string | null {
  if (voie === "ouverte") return `La signature électronique vous est proposée en premier. ${PAPIER_TOUJOURS_POSSIBLE} : ${papier}`;
  if (voie === "en_preparation") return `La signature électronique est en préparation. Aujourd’hui, la signature se fait sur papier : ${papier}`;
  // Jamais « la signature se fait sur papier » sans condition : des invitations sont peut-être déjà parties (M-d).
  if (voie === "suspendue") return `L’envoi de nouveaux documents en signature électronique est suspendu pour le moment ; un envoi déjà parti se suit par le bouton « ${LIBELLE_SIGNATURE_ELECTRONIQUE} ». Pour un nouveau document, la signature se fait sur papier : ${papier}`;
  return null;
}
