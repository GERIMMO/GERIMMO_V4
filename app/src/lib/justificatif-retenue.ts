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
type FichePiece = { purged_at?: string | null } | null;
export type JustificatifRetenue = {
  sans_justificatif?: boolean | null;
  justificatif_document?: unknown;
  /**
   * Seconde reprise du lot D3 (point 3) : la fiche de la pièce, lue avec la retenue par
   * `piece:documents!retenues_justificatif_document_fkey(purged_at)` (un objet, ou une liste d'un élément), pour savoir
   * si une règle de conservation l'a purgée. Les trois lectures des retenues l'écrivent en toutes lettres (un contrôle
   * automatique relit chaque `select` du code). Une fiche que la personne connectée ne peut pas lire revient vide : la
   * pièce est alors tenue pour présente (on ne sait pas qu'elle est purgée).
   */
  piece?: FichePiece | FichePiece[];
};

/** La retenue garde le lien vers sa pièce, mais le fichier a été supprimé par une règle de conservation. */
export function piecePurgee(r: JustificatifRetenue): boolean {
  const fiche = Array.isArray(r.piece) ? r.piece[0] : r.piece;
  return Boolean(r.justificatif_document) && Boolean(fiche?.purged_at);
}

/** Une pièce purgée ne justifie plus rien pour un NOUVEAU décompte (les PDF déjà rangés restent tels quels). */
export function retenueJustifiee(r: JustificatifRetenue): boolean {
  return Boolean(r.justificatif_document) && r.sans_justificatif !== true && !piecePurgee(r);
}

/**
 * Seconde reprise du lot D3 (point 2). Un agent limité à son portefeuille ne voit pas la pièce déposée par un collègue :
 * l'écran ne la lui propose pas, et la base refuse de déposer deux fois le même fichier dans l'espace. On lui dit quoi
 * faire, sans lui ouvrir la lecture de cette pièce.
 */
export const PIECE_DEPOSEE_PAR_UN_AUTRE =
  "Cette pièce a été déposée par une autre personne de votre espace : demandez à un administrateur de la rattacher.";

/** Le refus de la base « fichier identique déjà dans la GED », reçu alors que l'écran n'a trouvé aucun doublon lisible. */
export function estRefusFichierDejaDepose(message: string): boolean {
  return message.includes("strictement identique existe déjà");
}

/** Le début de la ligne « À renseigner » d'une retenue sans pièce : `lienPourManquant` la reconnaît à ce début. */
export const DEBUT_MANQUE_JUSTIFICATIF_RETENUE = "justificatif de la retenue";

export function manqueJustificatifRetenue(libelle: unknown): string {
  return `${DEBUT_MANQUE_JUSTIFICATIF_RETENUE} « ${String(libelle ?? "").trim() || "sans libellé"} » (un devis suffit)`;
}

/**
 * Seconde reprise du lot D3 (point 1). Une pièce déposée depuis l'écran de la restitution est rangée sous le titre
 * « Devis/facture — <libellé de la retenue> ». Quand la même pièce (rangée dans l'espace, pas dans un dossier) justifie
 * aussi une retenue d'un AUTRE bail, ce titre porte le libellé de la retenue de l'autre bail. Le locataire lit donc un
 * titre refait avec les libellés de SES retenues, ou le titre court si la pièce n'en justifie aucune.
 * Un autre document (état des lieux, courrier…) garde son titre.
 */
export const DEBUT_TITRE_PIECE_RETENUE = "Devis/facture";

export function titrePieceRetenuePourLocataire(
  titre: string | null,
  documentId: string,
  mesRetenues: { libelle?: string | null; justificatif_document?: string | null }[]
): string | null {
  if (!titre?.startsWith(`${DEBUT_TITRE_PIECE_RETENUE} — `)) return titre;
  const libelles = mesRetenues.filter((r) => r.justificatif_document === documentId).map((r) => String(r.libelle ?? "").trim()).filter(Boolean);
  return libelles.length ? `${DEBUT_TITRE_PIECE_RETENUE} — ${libelles.join(", ")}` : DEBUT_TITRE_PIECE_RETENUE;
}
