// Référentiel des incidents (Sprint 7, module 7 + registre A5) — une seule
// source pour tous les écrans, sur le modèle de lib/baux.ts. La machine à
// états est défendue en base (fonctions SECURITY DEFINER) ; ici on la décrit
// pour l'affichage et pour les contrôles de formulaire.

export type EtatIncident =
  | "declare"
  | "qualifie"
  | "affecte"
  | "en_cours"
  | "termine"
  | "clos"
  | "rouvert";

export type ImputationIncident = "locataire" | "proprietaire" | "degradation_fautive";

// Registre A5 (7 états). Les transitions non listées sont interdites —
// notamment déclaré → affecté (RM-7.2.7), en cours → clos (RM-7.5.1) et
// clos → déclaré (la réouverture repasse par la qualification).
export const TRANSITIONS_INCIDENT: Record<EtatIncident, EtatIncident[]> = {
  declare: ["qualifie", "clos"],
  qualifie: ["affecte", "clos"],
  affecte: ["en_cours", "qualifie"],
  en_cours: ["termine"],
  termine: ["clos"],
  clos: ["rouvert"],
  rouvert: ["qualifie"],
};

export function transitionIncidentPossible(de: string, vers: string): boolean {
  return (TRANSITIONS_INCIDENT[de as EtatIncident] ?? []).includes(vers as EtatIncident);
}

export const ETATS_INCIDENT: Record<string, string> = {
  declare: "À qualifier",
  qualifie: "Qualifié",
  affecte: "Affecté",
  en_cours: "En cours",
  termine: "Terminé — à clôturer",
  clos: "Clos",
  rouvert: "Rouvert — à requalifier",
};

// Grammaire maquette : rouge = action attendue de l'agence, encre = en cours,
// vert = clos.
export const COULEURS_ETAT_INCIDENT: Record<string, string> = {
  declare: "puce puce-rouge",
  qualifie: "puce puce-encre",
  affecte: "puce puce-encre",
  en_cours: "puce puce-encre",
  termine: "puce puce-rouge",
  clos: "puce puce-loue",
  rouvert: "puce puce-rouge",
};

// Le locataire lit son statut dans ses mots (maquette, traduction LIB_LOC) —
// jamais le vocabulaire interne.
export function libelleEtatLocataire(
  etat: string,
  imputation: string | null
): string {
  switch (etat) {
    case "declare":
      return "Reçu — votre gérant l'examine";
    case "rouvert":
      return "Rouvert — votre gérant le réexamine";
    case "qualifie":
      return imputation === "proprietaire"
        ? "Pris en charge par le propriétaire"
        : "À votre charge";
    case "affecte":
    case "en_cours":
      return "Un artisan s'en occupe";
    case "termine":
      return "Intervention terminée";
    case "clos":
      return "Clos";
    default:
      return etat;
  }
}

export const COULEURS_ETAT_LOCATAIRE: Record<string, string> = {
  declare: "puce puce-encre",
  qualifie: "puce puce-prep",
  affecte: "puce puce-encre",
  en_cours: "puce puce-encre",
  termine: "puce puce-prep",
  clos: "puce puce-loue",
  rouvert: "puce puce-encre",
};

export const IMPUTATIONS_INCIDENT: Record<string, string> = {
  locataire: "Charge locataire",
  proprietaire: "Charge propriétaire",
  degradation_fautive: "Dégradation fautive — charge locataire",
};

export const COULEURS_IMPUTATION: Record<string, string> = {
  locataire: "puce puce-prep",
  proprietaire: "puce puce-encre",
  degradation_fautive: "puce puce-rouge",
};

export const URGENCES_INCIDENT: Record<string, string> = {
  normale: "Normal",
  urgente: "Urgent",
};

export const CANAUX_INCIDENT: Record<string, string> = {
  espace_locataire: "Espace locataire",
  agence: "Agence",
};

export const MOTIFS_CLOTURE: Record<string, string> = {
  resolu: "Résolu",
  sans_suite: "Classé sans suite",
  transmis_syndic: "Transmis au syndic (parties communes)",
};

// Chronologie de la fiche : libellés des événements tracés en base
export const TYPES_EVENEMENT_INCIDENT: Record<string, string> = {
  declaration: "Déclaration",
  qualification: "Qualification",
  contestation: "Contestation du locataire",
  cloture: "Clôture",
  reouverture: "Réouverture",
  attribution: "Attribution",
  photo: "Photo ajoutée",
};

export const PIECES_INCIDENT = [
  "Cuisine",
  "Salle d'eau",
  "Séjour",
  "Chambre",
  "Entrée ou couloir",
  "Parties communes",
] as const;

// Repère juridique d'une catégorie : qui prend EN GÉNÉRAL la réparation en
// charge, et sur quel fondement. C'est une INFORMATION, jamais une
// pré-sélection : « la cause ne se déduit pas de la catégorie » (RM-7.2.1,
// décision actée — une canalisation bouchée par négligence est locative, par
// vétusté non). L'agent tranche et justifie.
export type CategorieIncident = {
  slug: string;
  libelle: string;
  court: string;
  repere: { charge: "locataire" | "proprietaire"; fondement: string } | null;
};

export const CATEGORIES_INCIDENT: CategorieIncident[] = [
  {
    slug: "plomberie_joint",
    libelle: "Plomberie — joint, siphon, robinetterie",
    court: "Fuite / robinetterie",
    repere: { charge: "locataire", fondement: "Décret 87-712 · réparations locatives" },
  },
  {
    slug: "plomberie_canalisation",
    libelle: "Plomberie — canalisation encastrée, colonne",
    court: "Canalisation / colonne",
    repere: { charge: "proprietaire", fondement: "Gros entretien · hors décret 87-712" },
  },
  {
    slug: "chauffage_entretien",
    libelle: "Chauffage — entretien annuel de la chaudière",
    court: "Entretien chaudière",
    repere: { charge: "locataire", fondement: "Décret 87-712 · réparations locatives" },
  },
  {
    slug: "chauffage_remplacement",
    libelle: "Chauffage — remplacement de l'appareil",
    court: "Remplacement chauffage",
    repere: { charge: "proprietaire", fondement: "Vétusté · charge du bailleur" },
  },
  {
    slug: "chauffage_panne",
    libelle: "Chauffage — radiateur ou eau chaude en panne",
    court: "Panne de chauffage",
    repere: null,
  },
  {
    slug: "electricite_courant",
    libelle: "Électricité — interrupteur, prise, ampoule",
    court: "Prise / interrupteur",
    repere: { charge: "locataire", fondement: "Décret 87-712 · réparations locatives" },
  },
  {
    slug: "electricite_tableau",
    libelle: "Électricité — mise aux normes du tableau",
    court: "Tableau électrique",
    repere: { charge: "proprietaire", fondement: "Décence du logement" },
  },
  {
    slug: "menuiserie_vitre",
    libelle: "Menuiserie — vitre brisée",
    court: "Vitre brisée",
    repere: { charge: "locataire", fondement: "Décret 87-712, sauf cause extérieure" },
  },
  {
    slug: "humidite_infiltration",
    libelle: "Humidité — infiltration, tache au plafond",
    court: "Infiltration / humidité",
    repere: { charge: "proprietaire", fondement: "Obligation de clos et couvert" },
  },
  {
    slug: "serrurerie_cle",
    libelle: "Serrurerie — clé perdue, cylindre",
    court: "Clé / cylindre",
    repere: { charge: "locataire", fondement: "Décret 87-712 · réparations locatives" },
  },
  {
    slug: "serrurerie_porte",
    libelle: "Serrurerie — serrure de porte palière grippée",
    court: "Serrure grippée",
    repere: null,
  },
  {
    slug: "nuisibles",
    libelle: "Nuisibles — punaises, cafards, rongeurs",
    court: "Nuisibles",
    repere: { charge: "proprietaire", fondement: "Décence à la remise des clés" },
  },
  {
    slug: "autre",
    libelle: "Autre problème",
    court: "Autre",
    repere: null,
  },
];

export function categorieIncident(slug: string | null | undefined): CategorieIncident | undefined {
  return CATEGORIES_INCIDENT.find((c) => c.slug === slug);
}

// Titre d'un incident dans les listes : le libellé court de sa catégorie
export function titreIncident(categorie: string): string {
  return categorieIncident(categorie)?.court ?? categorie;
}
