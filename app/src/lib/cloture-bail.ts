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

/**
 * Vrai quand l'écran doit montrer la case « Je confirme la clôture avant la fin du préavis ».
 *
 *  - le calcul de l'écran : la sortie précède la date d'effet qu'il connaît ;
 *  - ou le refus de la base (GRC01) : si elle a réclamé la confirmation, c'est qu'elle a lu la
 *    date d'effet autrement que l'écran, et sa demande prime — mais seulement pour la date
 *    qu'elle a refusée. Une date changée depuis redevient l'affaire du calcul de l'écran ; si
 *    la base n'a pas rendu la date, ou si le champ est encore vide, sa demande s'applique.
 */
export function confirmationAAfficher({
  dateSortie,
  dateEffet,
  confirmationRequise,
  dateRefusee,
}: {
  dateSortie: string | null | undefined;
  dateEffet: string | null | undefined;
  confirmationRequise: boolean | undefined;
  dateRefusee: string | null | undefined;
}): boolean {
  if (clotureAnticipee(dateSortie, dateEffet)) return true;
  if (!confirmationRequise) return false;
  return !dateSortie || !dateRefusee || dateSortie === dateRefusee;
}
