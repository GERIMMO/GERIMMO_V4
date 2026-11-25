// Grille de suggestion pour les charges de copropriété (décret 87-713).
// Commune à tous les espaces (le paramétrage par agence relève du module 18, différé).
//
// AUDIT PALIER 1 DU 22/11/2026, P0-03 (relevés C1, C2, C4). Cette grille ne DÉCIDE plus rien : elle SUGGÈRE une nature
// d'après l'intitulé du poste, et chaque poste naît « à qualifier » (`natureDeNaissance`). Avant, un poste dont
// l'intitulé contenait un mot de la liste naissait « récupérable » et entrait dans la régularisation sans qu'on le
// confirme : « Travaux ascenseur », « Création jardin » ou « Nouveau tableau électrique » (le mot « eau » trouvé dans
// « nouveau ») étaient mis à la charge du locataire.
//  - les mots sont cherchés ENTIERS, pluriel admis : « eau » ne se trouve plus dans « nouveau », « panneau »,
//    « bureau », ni « syndic » dans « syndicat » ;
//  - un intitulé qui parle de travaux, de réparation, de création… ou d'un gardien ne reçoit AUCUNE suggestion : ce sont
//    les cas où la grille se trompait, ou dont la part récupérable n'est pas tout ou rien (JURISTE.md) ;
//  - la désinsectisation ne reçoit plus de suggestion tant que le texte officiel n'a pas été relu.
// Le fonds travaux ALUR n'est jamais récupérable (RM-0c.3.4, blocage absolu) : lui seul garde sa nature dès la saisie.

export type NatureCharge = "recuperable" | "non_recuperable" | "a_qualifier";

export type PropositionGrille = { nature: NatureCharge; fonds_alur: boolean };

// Fonds travaux ALUR / travaux votés : jamais récupérable, marqué comme tel.
const MOTS_ALUR = ["fonds travaux", "fonds de travaux", "fonds alur", "alur", "provision travaux", "provision pour travaux"];

// Suggestion « récupérable ».
const MOTS_RECUPERABLE = [
  "ascenseur", "eau froide", "eau chaude", "eau", "compteur", "chauffage",
  "combustible", "menage", "nettoyage", "entretien des parties communes",
  "parties communes", "espaces verts", "jardin", "ordures", "dechets",
  "minuterie", "electricite des communs", "interphone", "vmc", "ventilation",
  "entretien portail", "entretien ascenseur", "taxe de balayage",
];

// Suggestion « non récupérable » (propriétaire) : honoraires, assurance, gros travaux, remplacements.
const MOTS_NON_RECUPERABLE = [
  "honoraires", "syndic", "assurance", "ravalement", "toiture", "gros travaux",
  "remplacement", "procedure", "avocat", "huissier", "frais de gestion",
  "administration", "diagnostic", "expertise", "façade", "facade", "mise aux normes",
];

// Aucune suggestion, même si un mot « récupérable » figure dans l'intitulé.
const MOTS_SANS_SUGGESTION = [
  "travaux", "reparation", "refection", "renovation", "peinture", "installation", "creation",
  "modernisation", "abattage", "gardien", "gardienne", "concierge", "employe d'immeuble", "desinsectisation",
];

// Retire accents et met en minuscules pour une comparaison robuste.
function normaliser(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Une expression est trouvée si chacun de ses mots figure ENTIER, à la suite, dans l'intitulé ; un « s » ou un « x »
// final est admis (ascenseurs, eaux, travaux). Tout ce qui n'est ni lettre ni chiffre sépare deux mots.
function contient(libelleNormalise: string, expression: string): boolean {
  const mots = normaliser(expression).trim().split(/[^a-z0-9]+/).filter(Boolean);
  if (!mots.length) return false;
  // Les mots ne contiennent plus que des lettres et des chiffres : rien à protéger dans le motif.
  const motif = mots.map((m) => `${m}[sx]?`).join("[^a-z0-9]+");
  return new RegExp(`(?:^|[^a-z0-9])${motif}(?:$|[^a-z0-9])`).test(libelleNormalise);
}

/** La nature SUGGÉRÉE d'après l'intitulé. `a_qualifier` : aucune suggestion. */
export function proposerNature(libelle: string): PropositionGrille {
  const l = normaliser(libelle);
  const un = (mots: string[]) => mots.some((m) => contient(l, m));
  if (un(MOTS_ALUR)) return { nature: "non_recuperable", fonds_alur: true };
  if (un(MOTS_NON_RECUPERABLE)) return { nature: "non_recuperable", fonds_alur: false };
  if (un(MOTS_SANS_SUGGESTION)) return { nature: "a_qualifier", fonds_alur: false };
  if (un(MOTS_RECUPERABLE)) return { nature: "recuperable", fonds_alur: false };
  return { nature: "a_qualifier", fonds_alur: false };
}

/**
 * La nature qu'un poste porte À SA SAISIE : « à qualifier », toujours — sauf le fonds travaux ALUR, jamais récupérable.
 * La suggestion ne s'applique que si le gestionnaire la choisit et la confirme.
 */
export function natureDeNaissance(libelle: string): PropositionGrille {
  return proposerNature(libelle).fonds_alur ? { nature: "non_recuperable", fonds_alur: true } : { nature: "a_qualifier", fonds_alur: false };
}

/** La phrase affichée à côté d'un poste encore « à qualifier ». `null` : rien à suggérer. */
export function phraseSuggestion(libelle: string): string | null {
  const { nature } = proposerNature(libelle);
  if (nature === "recuperable") return "Suggestion : récupérable — à confirmer";
  if (nature === "non_recuperable") return "Suggestion : non récupérable — à confirmer";
  return null;
}

export const LIBELLES_NATURE: Record<NatureCharge, string> = {
  recuperable: "Récupérable (locataire)",
  non_recuperable: "Non récupérable (propriétaire)",
  a_qualifier: "À qualifier",
};
