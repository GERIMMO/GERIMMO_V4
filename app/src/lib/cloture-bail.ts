// Clôture d'un bail (décision D34 du 14/10/2026, fiche SOR-04) : le jour où le
// locataire a réellement quitté le logement est enregistré à la clôture. Quand
// il précède la date d'effet du préavis, la clôture se confirme.
//
// Ce fichier ne contient que des règles pures : la base (terminer_bail) reste
// seule juge, l'écran ne fait que prévenir avant l'envoi.

/** Code SQLSTATE de terminer_bail : clôture avant la fin du préavis, non confirmée. */
export const CODE_CONFIRMATION_CLOTURE = "GRC01";

const FORME_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Date AAAA-MM-JJ saisie dans un champ de date, ou null si elle est vide ou mal formée. */
export function lireDateSortie(brut: FormDataEntryValue | null | undefined): string | null {
  const texte = typeof brut === "string" ? brut.trim() : "";
  return FORME_DATE.test(texte) ? texte : null;
}

/** Vrai quand la sortie réelle précède la date d'effet du préavis (dates AAAA-MM-JJ). */
export function clotureAnticipee(
  dateSortie: string | null | undefined,
  dateEffet: string | null | undefined
): boolean {
  return Boolean(dateSortie && dateEffet && dateSortie < dateEffet);
}
