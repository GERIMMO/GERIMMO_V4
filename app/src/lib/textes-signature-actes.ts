// Textes fixes des actes signés dans Gerimmo (plan de conformité du 23/10/2026, lot 1D ; décision du dirigeant du 23/10
// « Cautionnement et état des lieux signés dans Gerimmo »). Module pur : lu par les modèles de documents, les écrans
// (composants client) et le message d'invitation du prestataire de signature. Aucun accès serveur ici.

/**
 * Rappel au locataire, imprimé dans l'état des lieux d'entrée et repris dans l'invitation à le signer.
 * À relire par le juriste (source non ouverte le 23/10/2026) : délai de dix jours « suivant son établissement » (et non
 * « de sa signature ») et premier mois de la période de chauffe, d'après l'article 3-2 de la loi n° 89-462 du
 * 6 juillet 1989, non comparé sur Légifrance (plan du 23/10, § 2 et § 5).
 */
export const RAPPEL_COMPLEMENT_EDL_ENTREE =
  "Pour un état des lieux d'entrée, vous pouvez demander au bailleur de le compléter dans les dix jours suivant son établissement et, pour les éléments de chauffage, pendant le premier mois de la période de chauffe (article 3-2 de la loi du 6 juillet 1989).";

/**
 * La case que le bailleur coche avant d'envoyer un état des lieux en signature. La base enregistre exactement ce texte
 * (`confirmer_edl_sur_place`, migration 20261024120000), avec la date au format jj/mm/aaaa.
 */
export function confirmationEdlSurPlace(dateVisite: string): string {
  return `Je confirme que cet état des lieux a été établi contradictoirement, sur place, le ${dateVisite}, en présence du locataire ou de son représentant.`;
}

/** « 2026-10-01 » → « 01/10/2026 » ; « » pour une saisie qui n'est pas une date complète. */
export function dateVisiteFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/**
 * La case du bailleur avant de générer un acte de cautionnement (constat R30).
 * À relire par le juriste (source non ouverte le 23/10/2026) : interdiction du cumul d'un cautionnement avec une
 * assurance ou une autre garantie des obligations locatives, sauf locataire étudiant ou apprenti, et nullité qui en
 * résulte, d'après l'article 22-1 de la loi n° 89-462 du 6 juillet 1989, non comparé sur Légifrance.
 */
export const CERTIFICATION_SANS_GARANTIE_CUMULEE =
  "Je certifie n'avoir souscrit aucune assurance ni aucune autre garantie couvrant les obligations locatives de ce locataire (par exemple une assurance loyers impayés), ou louer ce logement à un étudiant ou à un apprenti. À défaut, le cautionnement serait nul (article 22-1 de la loi du 6 juillet 1989).";

/**
 * Constat R58 : le garant signe aussi le bail, mais ne s'y engage pas comme caution. Cadre « La caution » du bail
 * (sous les noms) et page de signature électronique du garant.
 */
export const MENTION_CADRE_CAUTION_BAIL =
  "Reconnaît avoir reçu un exemplaire du présent contrat. Son engagement de caution résulte du seul acte de cautionnement signé séparément.";
export const MENTION_PAGE_SIGNATURE_GARANT =
  "En signant cette page, la caution reconnaît avoir reçu un exemplaire du présent contrat. Elle ne s'engage comme caution que par l'acte de cautionnement signé séparément.";

export const REFUS_SANS_GARANTIE_CUMULEE =
  "Confirmez l'absence d'assurance loyers impayés ou d'autre garantie avant de préparer l'acte.";
