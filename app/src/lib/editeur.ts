// L'identité de l'éditeur, en un seul endroit.
//
// Les mentions légales, les conditions générales et la politique de
// confidentialité citent toutes les mêmes faits : dénomination, siège,
// immatriculation, contact. Écrits trois fois, ils divergent au premier
// changement d'adresse — et une mention légale fausse est pénalement
// sanctionnée (art. 6-III de la LCEN). Ils vivent donc ici, et nulle part
// ailleurs.
//
// `null` veut dire « pas encore fourni » : la page l'affiche alors comme un
// champ RESTÉ À REMPLIR, en toutes lettres, exactement comme le générateur de
// documents traite une donnée manquante (lib/documents/gabarit.ts). Elle ne le
// remplace jamais par du vide, ni par une valeur vraisemblable : un contrat
// dont on devine les parties n'engage personne.

export type FaitEditeur = string | null;

export const EDITEUR = {
  /** Dénomination sociale ou nom de l'entrepreneur individuel. */
  denomination: null as FaitEditeur,
  /** SAS, SARL, entreprise individuelle… */
  forme: null as FaitEditeur,
  /** Capital social, si société. `null` pour une entreprise individuelle. */
  capital: null as FaitEditeur,
  /** Adresse complète du siège. */
  siege: null as FaitEditeur,
  /** Ville et numéro d'immatriculation au RCS. */
  rcs: null as FaitEditeur,
  siret: null as FaitEditeur,
  tvaIntracommunautaire: null as FaitEditeur,
  /** Nom et qualité du directeur de la publication. */
  directeurPublication: null as FaitEditeur,
  /** Adresse électronique de contact du public. */
  email: null as FaitEditeur,
  telephone: null as FaitEditeur,
  /** Nom du médiateur de la consommation, puis ses coordonnées. */
  mediateurNom: null as FaitEditeur,
  mediateurAdresse: null as FaitEditeur,
  mediateurSite: null as FaitEditeur,
} as const;

/**
 * Les faits SANS LESQUELS la page ne remplit pas son office légal.
 *
 * Le capital ne figure pas dans cette liste (une entreprise individuelle n'en
 * a pas), ni la TVA (toutes les structures n'y sont pas assujetties), ni le
 * téléphone (l'adresse électronique suffit au sens de la LCEN). Le médiateur
 * en fait partie : dès qu'un client est un particulier, son absence est un
 * manquement (art. L. 616-1 du code de la consommation).
 */
const REQUIS = [
  ["denomination", "la dénomination sociale"],
  ["forme", "la forme juridique"],
  ["siege", "l'adresse du siège"],
  ["rcs", "l'immatriculation au RCS"],
  ["siret", "le SIRET"],
  ["directeurPublication", "le directeur de la publication"],
  ["email", "l'adresse de contact"],
  ["mediateurNom", "le médiateur de la consommation"],
] as const satisfies readonly (readonly [keyof typeof EDITEUR, string])[];

/**
 * Ce qu'il manque encore, en français, pour l'afficher tel quel.
 *
 * Le paramètre existe pour que le test puisse vérifier la mécanique sur un
 * éditeur complet — sans lui, il ne pourrait qu'observer l'état du jour et ne
 * prouverait jamais que l'encadré disparaît une fois les faits fournis.
 */
export function faitsManquants(editeur: Record<string, FaitEditeur> = EDITEUR): string[] {
  return REQUIS.filter(([cle]) => !editeur[cle]).map(([, libelle]) => libelle);
}

/** Vrai tant que les documents ne sont pas finalisés. */
export function documentsIncomplets(editeur: Record<string, FaitEditeur> = EDITEUR): boolean {
  return faitsManquants(editeur).length > 0;
}

// ── Version des conditions générales ───────────────────────────────────────
//
// Le contrat peut changer ; ce qui a été accepté, non. On enregistre donc à
// l'inscription QUELLE version a été acceptée, et quand — sans quoi l'éditeur
// ne peut pas prouver le contenu de l'accord le jour de sa formation
// (relevé du 11/09 : la base notait que la case avait été cochée, rien de
// plus).
//
// À incrémenter à CHAQUE modification de fond des conditions, en même temps
// que `CONDITIONS_DATE`.
export const CONDITIONS_VERSION = "2026-09-11";

/** Date d'entrée en vigueur affichée en tête des conditions. */
export const CONDITIONS_DATE = "11 septembre 2026";
