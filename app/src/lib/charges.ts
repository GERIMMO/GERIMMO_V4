// Grille de récupérabilité des charges de copropriété — décret 87-713.
// Système par défaut, commune à toutes les agences (le paramétrage par agence
// relève du module 18, différé). Elle PROPOSE une nature ; l'agent corrige.
// Le fonds travaux ALUR n'est jamais récupérable (RM-0c.3.4, blocage absolu).

export type NatureCharge = "recuperable" | "non_recuperable" | "a_qualifier";

export type PropositionGrille = { nature: NatureCharge; fonds_alur: boolean };

// Fonds travaux ALUR / travaux votés : jamais récupérable, marqué comme tel.
const MOTS_ALUR = ["fonds travaux", "fonds de travaux", "fonds alur", "alur", "provision travaux", "provision pour travaux"];

// Récupérable auprès du locataire (annexe du décret 87-713).
const MOTS_RECUPERABLE = [
  "ascenseur", "eau froide", "eau chaude", "eau ", "compteur", "chauffage",
  "combustible", "menage", "nettoyage", "entretien des parties communes",
  "parties communes", "espaces verts", "jardin", "ordures", "dechets",
  "minuterie", "electricite des communs", "interphone", "vmc", "ventilation",
  "entretien portail", "entretien ascenseur", "taxe de balayage", "desinsectisation",
];

// Non récupérable (propriétaire) : honoraires, assurance, gros travaux, remplacements.
const MOTS_NON_RECUPERABLE = [
  "honoraires", "syndic", "assurance", "ravalement", "toiture", "gros travaux",
  "remplacement", "procedure", "avocat", "huissier", "frais de gestion",
  "administration", "diagnostic", "expertise", "façade", "facade", "mise aux normes",
];

// Retire accents et met en minuscules pour une comparaison robuste.
function normaliser(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function proposerNature(libelle: string): PropositionGrille {
  const l = normaliser(libelle);
  if (MOTS_ALUR.some((m) => l.includes(normaliser(m)))) {
    return { nature: "non_recuperable", fonds_alur: true };
  }
  if (MOTS_NON_RECUPERABLE.some((m) => l.includes(normaliser(m)))) {
    return { nature: "non_recuperable", fonds_alur: false };
  }
  if (MOTS_RECUPERABLE.some((m) => l.includes(normaliser(m)))) {
    return { nature: "recuperable", fonds_alur: false };
  }
  return { nature: "a_qualifier", fonds_alur: false };
}

export const LIBELLES_NATURE: Record<NatureCharge, string> = {
  recuperable: "Récupérable (locataire)",
  non_recuperable: "Non récupérable (propriétaire)",
  a_qualifier: "À qualifier",
};
