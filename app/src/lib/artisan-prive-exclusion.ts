// Décision D25-B du dirigeant (14/10/2026, fiche ARC-08) : un artisan refusé par la plateforme, ou placé sur la
// liste noire globale, ne peut plus rien écrire dans l'outil clients externes (client, chantier, devis, facture).
// Il continue de lire ses dossiers et d'exporter son registre. Un artisan « en attente » garde l'outil.
//
// La base (migration 20261014311000) refuse l'écriture et rend ces mêmes textes ; l'écran et l'action serveur les
// reprennent d'ici. Une seule rédaction : tests/artisan-externe-numero-et-exclusion.test.ts compare les deux.

/** Pourquoi la saisie est fermée : `null` quand l'artisan peut écrire. La liste noire l'emporte sur le refus. */
export type ExclusionArtisan = "refuse" | "liste_noire";

export const MESSAGE_ECRITURE_FERMEE: Record<ExclusionArtisan, string> = {
  refuse:
    "Votre inscription a été refusée par Gerimmo : vous ne pouvez plus ajouter ni modifier de clients, de chantiers, de devis ni de factures dans cet outil. Vos dossiers, vos justificatifs et votre export restent consultables.",
  liste_noire:
    "Votre compte a été retiré du réseau par Gerimmo : vous ne pouvez plus ajouter ni modifier de clients, de chantiers, de devis ni de factures dans cet outil. Vos dossiers, vos justificatifs et votre export restent consultables.",
};

/** La valeur lue en base (`artisan_exclusion_plateforme`, `activation.exclusion`), ramenée à un cas connu ou à `null`. */
export function exclusionLue(brut: unknown): ExclusionArtisan | null {
  return brut === "refuse" || brut === "liste_noire" ? brut : null;
}
