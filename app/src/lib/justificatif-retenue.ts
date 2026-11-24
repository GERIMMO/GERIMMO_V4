/**
 * Décision du dirigeant du 24/11/2026 (Q49) : « aligne les deux décomptes : chaque retenue a son justificatif, un devis
 * suffit. »
 *
 * Une seule règle, lue par le décompte de restitution du dépôt, par le décompte des retenues et par l'écran de la
 * restitution : une retenue est justifiée quand une pièce est déposée pour elle. La pièce peut être un devis, une
 * facture, un état des lieux, des photos : Gerimmo ne regarde pas sa nature. Une retenue sans pièce bloque les deux
 * PDF, avec une ligne « À renseigner » par retenue, qui mène à la restitution du dépôt (ou-renseigner.ts).
 * Avant, le décompte de restitution imprimait « Non fourni » et seul le décompte des retenues était bloqué.
 *
 * Module sans import : il sert aux modèles de documents (serveur) comme à l'écran (navigateur).
 */
export type JustificatifRetenue = { sans_justificatif?: boolean | null; justificatif_document?: unknown };

export function retenueJustifiee(r: JustificatifRetenue): boolean {
  return Boolean(r.justificatif_document) && r.sans_justificatif !== true;
}

/** Le début de la ligne « À renseigner » d'une retenue sans pièce : `lienPourManquant` la reconnaît à ce début. */
export const DEBUT_MANQUE_JUSTIFICATIF_RETENUE = "justificatif de la retenue";

export function manqueJustificatifRetenue(libelle: unknown): string {
  return `${DEBUT_MANQUE_JUSTIFICATIF_RETENUE} « ${String(libelle ?? "").trim() || "sans libellé"} » (un devis suffit)`;
}
