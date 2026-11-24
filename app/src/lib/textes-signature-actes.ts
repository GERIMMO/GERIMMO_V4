// Textes fixes des actes signés dans Gerimmo (plan de conformité du 23/10/2026, lot 1D ; décision du dirigeant du 23/10
// « Cautionnement et état des lieux signés dans Gerimmo »). Module pur : lu par les modèles de documents, les écrans
// (composants client) et le message d'invitation du prestataire de signature. Aucun accès serveur ici.

/**
 * Rappel au locataire de son droit de faire compléter l'état des lieux d'entrée : un seul délai, deux formulations.
 * À relire par le juriste (source non ouverte le 23/10/2026) : délai de dix jours « qui suivent son établissement » (et non
 * « de sa signature », décision du dirigeant du 23/10) et premier mois de la période de chauffe, d'après l'article 3-2
 * de la loi n° 89-462 du 6 juillet 1989, non comparé sur Légifrance (plan du 23/10, § 2 et § 5).
 * Intégration des textes du 24/10 (choix délégué n° 8, journal du 24/10) : la même formule, « dans les dix jours qui
 * suivent son établissement », dans l'article 4.7 des conditions, le modèle de l'état des lieux, l'invitation à
 * signer et la notice d'information (tests/conditions-v1-textes.test.ts compare la page et le modèle).
 */
const DELAI_COMPLEMENT_EDL_ENTREE =
  "dans les dix jours qui suivent son établissement et, pour les éléments de chauffage, pendant le premier mois de la période de chauffe (article 3-2 de la loi du 6 juillet 1989).";
/** Dans le PDF de l'état des lieux d'entrée, après « Rappel au locataire : » (relecture du 24/10 : sans redite). */
export const RAPPEL_COMPLEMENT_EDL_ENTREE_DOCUMENT = `vous pouvez demander au bailleur de compléter le présent état des lieux ${DELAI_COMPLEMENT_EDL_ENTREE}`;
/**
 * Dans l'invitation à signer, lue par tous les signataires : adressé au seul locataire, comme les consignes
 * « Garant : … Propriétaire : … » (relecture du 24/10).
 */
export const RAPPEL_COMPLEMENT_EDL_ENTREE = `Locataire : vous pouvez demander au bailleur de compléter cet état des lieux d'entrée ${DELAI_COMPLEMENT_EDL_ENTREE}`;

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
/** Le cadre « La caution » s'accorde au nombre de garants du bail (relecture du 24/10). */
export function mentionCadreCautionBail(nombreGarants: number): string {
  return nombreGarants > 1
    ? "Reconnaissent avoir reçu un exemplaire du présent contrat. Leur engagement de caution résulte du seul acte de cautionnement signé séparément par chacune."
    : MENTION_CADRE_CAUTION_BAIL;
}
export const MENTION_PAGE_SIGNATURE_GARANT =
  "En signant cette page, la caution reconnaît avoir reçu un exemplaire du présent contrat. Elle ne s'engage comme caution que par l'acte de cautionnement signé séparément.";

/**
 * Textes officiels, lot T2 (R03-A1) — article 22-1 de la loi du 6 juillet 1989, lu dans le recueil fourni par le dirigeant :
 * « Si le bailleur est une personne morale autre qu'une société civile constituée exclusivement entre parents et alliés
 * jusqu'au quatrième degré inclus, le cautionnement ne peut être demandé que : - s'il est apporté par un des organismes dont
 * la liste est fixée par décret en Conseil d'Etat ; - ou si le logement est loué à un étudiant ne bénéficiant pas d'une
 * bourse de l'enseignement supérieur. » Gerimmo ne prépare que l'acte d'une personne (née le…, demeurant…) : pour un bailleur
 * « SCI » (non familiale) ou « Personne morale », l'acte est REFUSÉ, sauf si le bailleur déclare le second cas.
 */
export const DECLARATION_ETUDIANT_NON_BOURSIER =
  "Bailleur en société (autre qu'une SCI familiale) : je déclare que le logement est loué à un étudiant qui ne bénéficie pas d'une bourse de l'enseignement supérieur.";
export const REFUS_CAUTION_BAILLEUR_SOCIETE =
  "Gerimmo ne prépare pas cet acte : le bailleur est une société (autre qu'une SCI familiale). La loi ne lui permet de demander la caution d'une personne que si le logement est loué à un étudiant qui ne bénéficie pas d'une bourse de l'enseignement supérieur (article 22-1 de la loi du 6 juillet 1989). Si c'est le cas, cochez la case correspondante. Sinon, seule la caution d'un organisme habilité est possible, et elle ne se prépare pas dans Gerimmo.";
/** Lot T2 (R17-A3) — article 8-1 VI : en colocation, l'acte identifie, « sous peine de nullité », le colocataire garanti. */
export const REFUS_CAUTION_SANS_COLOCATAIRE =
  "Gerimmo ne prépare pas cet acte : le bail a plusieurs locataires et ce garant n'est rattaché à aucun d'eux. L'acte doit nommer le locataire pour lequel la caution s'engage (article 8-1 de la loi du 6 juillet 1989). Sur la fiche du bail, dans les personnes du bail, indiquez pour qui ce garant se porte caution, puis préparez l'acte.";

export const REFUS_SANS_GARANTIE_CUMULEE =
  "Confirmez l'absence d'assurance loyers impayés ou d'autre garantie avant de préparer l'acte.";

// Les libellés de la décision du 24/11/2026 (Q11) vivent dans lib/voie-signature.ts, avec l'état de la voie électronique.
export { LIBELLE_SIGNATURE_ELECTRONIQUE, PAPIER_TOUJOURS_POSSIBLE } from "./voie-signature";
