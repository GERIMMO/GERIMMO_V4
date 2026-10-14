// CONSEILS POUR CHOISIR SON LOCATAIRE — le contenu, sans écran.
//
// Demande du dirigeant (14/10/2026) : aider le PROPRIÉTAIRE BAILLEUR en gestion
// directe à relire le dossier d'un candidat avec les conditions d'une assurance
// loyers impayés (GLI), avant de signer le bail.
//
// CE QUE CE MODULE NE FAIT PAS, volontairement :
//  · il ne note, ne classe et ne refuse aucun candidat : aucune fonction ne
//    reçoit de dossier ni de montant ;
//  · il ne connaît pas le contrat du propriétaire : le texte est le même pour
//    tous, et renvoie chaque fois que nécessaire à « votre contrat » ;
//  · il n'invente aucun chiffre ni aucune règle : chaque seuil cité vient du
//    fichier de contenu validé (wiki « Choisir son locataire selon les
//    conditions des assurances loyers impayés », brouillon à relire sur les
//    sources primaires). Les seuils sont des ordres de grandeur d'assureurs,
//    jamais une norme.
//
// Le test `tests/conseils-locataire.test.ts` compare ce texte au fichier de
// contenu fourni et refuse tout chiffre ajouté.

/** Le niveau de certitude d'un conseil : d'où vient ce qu'il affirme. */
export type NiveauCertitude = "regle-legale" | "pratique-courante" | "variable-contrat";

export type ConseilLocataire = {
  id: string;
  titre: string;
  conseil: string;
  niveau: NiveauCertitude;
};

export type DescriptionNiveau = {
  id: NiveauCertitude;
  /** Le libellé est celui du fichier de contenu, avec une majuscule. */
  libelle: string;
  /** Une phrase qui dit ce que le niveau garantit — et ce qu'il ne garantit pas. */
  explication: string;
  /** Classe de pastille de la charte (globals.css). */
  puce: "puce-encre" | "puce-grise" | "puce-prep";
};

const NBSP = " ";

/**
 * Typographie française : l'espace avant « % », « € », « : » et « ; » et dans
 * les milliers ne doit pas se couper en fin de ligne (sur téléphone, « 37 » en
 * bout de ligne et « % » au début de la suivante se lisent mal). Les mots ne
 * changent pas.
 */
export function ponctuationFrancaise(texte: string): string {
  return texte
    .replace(/(\d) (?=\d{3}(?!\d))/g, `$1${NBSP}`)
    .replace(/ (?=[%€:;])/g, NBSP);
}

/** Du plus ferme au plus dépendant du contrat : c'est l'ordre d'affichage. */
export const NIVEAUX_CERTITUDE: readonly DescriptionNiveau[] = [
  {
    id: "regle-legale",
    libelle: "Règle légale",
    explication: "Ce que la loi prévoit, quel que soit votre contrat.",
    puce: "puce-encre",
  },
  {
    id: "pratique-courante",
    libelle: "Pratique courante des assureurs",
    explication: "Ce que les assureurs demandent souvent, sans que ce soit une obligation légale.",
    puce: "puce-grise",
  },
  {
    id: "variable-contrat",
    libelle: "Variable selon le contrat",
    explication: "Ce qui change d'un contrat à l'autre : seul votre contrat fait foi.",
    puce: "puce-prep",
  },
];

const BRUT: readonly ConseilLocataire[] = [
  {
    id: "taux-effort",
    titre: "Calculez le taux d'effort du dossier",
    conseil:
      "Divisez le loyer charges comprises par les revenus nets du candidat. Les contrats fixent souvent un maximum entre 33 et 37 % ; le seuil exact varie : à vérifier dans votre contrat.",
    niveau: "variable-contrat",
  },
  {
    id: "type-contrat-travail",
    titre: "Vérifiez le type de contrat de travail",
    conseil:
      "Le CDI hors période d'essai est le profil le plus souvent couvert. Pour un CDD (8 à 12 mois restants), un indépendant (souvent 2 ans d'activité) ou l'intérim : à vérifier dans votre contrat.",
    niveau: "variable-contrat",
  },
  {
    id: "garantie-sans-caution",
    titre: "Garantie souscrite : pas de caution à exiger",
    conseil:
      "Si vous avez souscrit une assurance loyers impayés (ou une autre garantie), vous ne pouvez pas exiger de caution. Exception : locataire étudiant ou apprenti. Une caution exigée à tort est nulle.",
    niveau: "regle-legale",
  },
  {
    id: "etudiant-apprenti-garant",
    titre: "Étudiant ou apprenti : vérifiez si un garant est requis",
    conseil:
      "Plusieurs contrats (MAIF, Matmut, Garantme) exigent une caution pour un étudiant ou un apprenti ; chez certains, les revenus du garant ne s'ajoutent pas à ceux du locataire. À vérifier dans votre contrat.",
    niveau: "variable-contrat",
  },
  {
    id: "pieces-liste-legale",
    titre: "Demandez uniquement les pièces de la liste légale",
    conseil:
      "Seules les pièces du décret du 5 novembre 2015 sont exigibles (identité, domicile, activité, ressources). Exemple interdit : relevé de compte. Amende administrative possible : jusqu'à 3 000 € pour un particulier.",
    niveau: "regle-legale",
  },
  {
    id: "authenticite-justificatifs",
    titre: "Contrôlez l'authenticité des justificatifs",
    conseil:
      "Certains contrats font perdre la garantie si les justificatifs ne sont pas vérifiés. Contrôlez l'avis d'imposition via le service officiel en ligne ou son code 2D-Doc, et conservez le dossier avec le bail.",
    niveau: "variable-contrat",
  },
  {
    id: "memes-criteres",
    titre: "Mêmes critères pour tous les candidats",
    conseil:
      "Appliquez à tous les mêmes critères objectifs, liés à la solvabilité. Refuser un dossier pour un motif discriminatoire (origine, handicap, âge, lieu de résidence…) est interdit et peut être puni pénalement.",
    niveau: "regle-legale",
  },
  {
    id: "revenus-hors-salaire",
    titre: "Revenus hors salaire : examinez le dossier",
    conseil:
      "Refuser un dossier à cause de la seule nature des revenus (allocation handicap, pension d'invalidité…), sans examen concret, peut être jugé discriminatoire (Défenseur des droits, 2025). Vérifiez aussi votre contrat.",
    niveau: "regle-legale",
  },
  {
    id: "locataire-deja-en-retard",
    titre: "Locataire déjà en retard : vérifiez les exclusions",
    conseil:
      "Plusieurs contrats excluent un locataire déjà en incident de paiement à la prise d'effet, ou exigent une ancienneté sans retard (4 mois chez Crédit Agricole). À vérifier dans votre contrat.",
    niveau: "variable-contrat",
  },
  {
    id: "logement-et-bail",
    titre: "Logement et bail : vérifiez les conditions du contrat",
    conseil:
      "Les contrats visent la résidence principale (résidence secondaire et saisonnier exclus) et demandent souvent une clause résolutoire. Certains excluent les baux de moins de 12 mois. À vérifier dans votre contrat.",
    niveau: "pratique-courante",
  },
  {
    id: "colocation-depart",
    titre: "Colocation : anticipez le départ d'un colocataire",
    conseil:
      "Si un colocataire part alors que ses revenus étaient nécessaires, la garantie peut cesser à la fin de sa solidarité ; son remplaçant peut devoir être réévalué. À vérifier dans votre contrat.",
    niveau: "variable-contrat",
  },
  {
    id: "visale-alternative",
    titre: "Visale : une alternative, pas un cumul avec la GLI",
    // Le fichier de contenu finissait par « Demande avant la signature. », qui
    // se lit comme un nom (« une demande ») autant que comme un ordre : la
    // phrase est complétée, sans rien ajouter à la règle.
    conseil:
      "Si un profil n'entre pas dans votre contrat, Visale (gratuite pour le bailleur) peut être une option, mais elle ne se cumule pas avec une assurance loyers impayés sur un même bail. La demande se fait avant la signature du bail.",
    niveau: "regle-legale",
  },
];

export const CONSEILS_CHOIX_LOCATAIRE: readonly ConseilLocataire[] = BRUT.map((c) => ({
  ...c,
  titre: ponctuationFrancaise(c.titre),
  conseil: ponctuationFrancaise(c.conseil),
}));

/** La mention générale, affichée après les conseils. */
export const MENTION_GENERALE_CONSEILS = ponctuationFrancaise(
  "Ces conseils sont donnés à titre indicatif : ils résument des pratiques courantes d'assureurs et des règles générales, et peuvent différer de votre contrat. Seules les conditions générales et particulières de votre contrat d'assurance font foi, et ces conseils ne remplacent pas un conseil juridique personnalisé."
);

/** Les conseils d'un niveau, dans l'ordre du fichier de contenu. */
export function conseilsDuNiveau(niveau: NiveauCertitude): ConseilLocataire[] {
  return CONSEILS_CHOIX_LOCATAIRE.filter((c) => c.niveau === niveau);
}
