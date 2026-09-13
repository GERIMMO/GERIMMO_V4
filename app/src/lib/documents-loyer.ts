/** Le terme soldé donne une quittance ; le paiement partiel donne un reçu.
 * Un statut inconnu ne permet pas de promettre une quittance. */
export function libelleDocumentLoyer(statut: string): string {
  if (statut === "paye") return "quittance";
  if (statut === "partiel") return "reçu de paiement partiel";
  return "justificatif de paiement";
}
