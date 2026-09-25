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

// ── Où écrire à l'éditeur ──────────────────────────────────────────────────
//
// Tant que `EDITEUR.email` manque, la seule voie ouverte au public est le
// formulaire de l'accueil, rubrique Agences. Les pages légales l'appelaient
// « formulaire de contact » : un locataire venu exercer ses droits tombait sur
// une demande de devis commerciale (relevé du 24/09). Elles le nomment
// désormais tel qu'il est, et l'adresse prend le relais dès qu'elle est
// fournie ci-dessus.
export const FORMULAIRE_ACCUEIL = "/#agences";

/** L'adresse à laquelle écrire, ou `null` : il faut alors passer par le formulaire. */
export function courrielDeContact(editeur: Record<string, FaitEditeur> = EDITEUR): string | null {
  return editeur.email || null;
}

// ── Prestataires (sous-traitants techniques) ───────────────────────────────
//
// Une seule liste pour les mentions légales et la page confidentialité : elles
// décrivaient les mêmes prestataires dans deux tableaux différents — colonnes
// dans un autre ordre, libellés divergents, Stripe sur une page seulement
// (relevé du 24/09). `localisation: null` s'affiche en réserve, comme un fait
// d'éditeur manquant.
export type Prestataire = { nom: string; role: string; localisation: FaitEditeur };

//
// Audit 25/09 (C2) : le code envoyait des données à Yousign, OpenAI et Meta
// sans que les pages légales les nomment. Le rôle décrit ce qui leur est
// transmis, tel que le code l'établit (lib/youtrust.ts, lib/analyse-veille.ts,
// lib/visuel-marketing.ts, admin/brief, admin/publications, lib/facebook.ts).
// La localisation n'est écrite que lorsqu'elle est certaine ; sinon `null`.
export const PRESTATAIRES: readonly Prestataire[] = [
  {
    nom: "Supabase",
    role: "Base de données, authentification, stockage des fichiers",
    localisation: "Région eu-west-3 (Paris, France)",
  },
  {
    nom: "Vercel",
    role: "Hébergement et diffusion de l'application",
    // La région des fonctions est fixée dans vercel.json (`regions: ["cdg1"]`) :
    // sans ce réglage, Vercel exécute le serveur à Washington, et les données
    // transitent hors UE à chaque page.
    localisation: "Région cdg1 (Paris, France)",
  },
  {
    nom: "Resend",
    role: "Envoi des courriels du service (quittances, avis, relances, rappels)",
    localisation: null,
  },
  {
    nom: "Stripe",
    role: "Encaissement des abonnements",
    localisation: "Irlande",
  },
  {
    nom: "Yousign",
    role: "Signature électronique des baux : le document à signer, le nom, l'adresse électronique et le téléphone de chaque signataire",
    localisation: "France",
  },
  {
    nom: "OpenAI",
    role: "Assistance rédactionnelle de la supervision (veille réglementaire, brouillons et illustrations du Journal) : textes éditoriaux et actualités publiques, sans donnée de locataire ni de bailleur",
    localisation: "États-Unis (transfert hors UE)",
  },
  {
    nom: "Meta (Facebook)",
    role: "Publication des articles du Journal sur la page Facebook de Gerimmo : titre, texte et illustration de l'article, sans donnée personnelle",
    localisation: "Irlande, avec transfert vers les États-Unis",
  },
];

/** Vrai tant qu'un prestataire n'a pas sa localisation. */
export function prestatairesIncomplets(liste: readonly Prestataire[] = PRESTATAIRES): boolean {
  return liste.some((p) => !p.localisation);
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
