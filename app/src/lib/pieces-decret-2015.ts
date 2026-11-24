// Lot T3 (R19-A1) — pièces justificatives qu'un bailleur peut exiger d'un candidat à la location (annexe I) ou de sa
// caution (annexe II) : décret n° 2015-1437 du 5 novembre 2015, pris pour l'article 22-2 de la loi du 6 juillet 1989.
//
// SOURCE : recueil des textes fourni par le dirigeant (annexes dans leur version en vigueur depuis le 1er janvier 2023),
// source et version déclarées, non recontrôlé par nous. Les `texte` ci-dessous sont recopiés mot pour mot de ce recueil
// (seuls les retours à la ligne de la mise en page sont retirés). Ne pas les retoucher : un changement du décret se
// reporte ici, à la main, depuis le texte officiel.
//
// POURQUOI UNE LISTE : avant ce lot, Gerimmo laissait demander n'importe quelle pièce (libellé libre) à un candidat ou à
// une caution. Les annexes sont des listes fermées ; avant la signature du bail, et pour une caution, la demande se
// choisit maintenant ici. Après la signature, la demande faite au locataire reste libre (le décret vise le candidat).
//
// DEUX FORMES DE CHOIX, selon les mots du décret :
//  - « Une pièce justificative d'identité … parmi les documents suivants », « Une seule pièce justificative de domicile
//    parmi les documents suivants » : UNE demande pour la rubrique entière (`unique`), la personne fournit l'un des
//    documents listés. Une seconde demande de la même rubrique est refusée tant que la première est EN COURS (reprise
//    T3R-6 : une pièce déjà reçue — une identité périmée ou illisible — peut être redemandée).
//
// NOMS ENREGISTRÉS (reprise T3R-5, T3R-6) : chaque nom est le début, mot pour mot, du texte du décret (le texte entier
// est joint à la demande quand le nom ne le contient pas). Les rubriques « une pièce » de l'annexe II portent en plus
// « (caution) » : sans cette marque, l'identité et le domicile d'un candidat et ceux d'une caution avaient le même nom,
// et une personne à la fois candidate et caution n'avait droit qu'à une seule demande pour les deux.
//  - « Un ou plusieurs documents … parmi les documents suivants » : une demande par document.
//
// DOUTE NOTÉ (pour le juriste) : dans le recueil, la liste d'identité de la caution (annexe II, A) s'arrête au permis de
// conduire et se termine par un point-virgule ; celle du candidat a un quatrième document (droit au séjour). Une ligne a
// pu manquer à l'extraction. Gerimmo s'en tient aux trois documents du recueil : il demande moins, jamais plus.

export type AnnexeDecret = "I" | "II";

export type PieceDecret = {
  /** Identifiant stable envoyé par le formulaire (jamais affiché). */
  code: string;
  annexe: AnnexeDecret;
  /** Lettre de la rubrique dans l'annexe. */
  rubrique: string;
  /** Vrai : la rubrique entière fait UNE demande (« une pièce », « une seule pièce »). */
  unique: boolean;
  /** Ce qui est enregistré comme nom de la demande (120 caractères au plus, limite de la base). */
  libelle: string;
  /** Texte du décret, mot pour mot : affiché à l'écran et joint à la demande quand le nom ne le contient pas en entier. */
  texte: string;
  type: "piece_identite" | "justificatif";
};

export const TITRES_ANNEXES: Record<AnnexeDecret, string> = {
  I: "Liste des pièces justificatives pouvant être exigées de chacun des candidats à la location",
  II: "Liste des pièces justificatives pouvant être exigées de leurs cautions",
};

/** Intitulés des rubriques, tels que le décret les écrit. */
export const RUBRIQUES_DECRET: Record<AnnexeDecret, Record<string, string>> = {
  I: {
    A: "A. - Une pièce justificative d'identité en cours de validité, comportant la photographie du titulaire parmi les documents suivants :",
    B: "B. - Une seule pièce justificative de domicile parmi les documents suivants :",
    C: "C. - Un ou plusieurs documents attestant des activités professionnelles parmi les documents suivants :",
    D: "D. - Un ou plusieurs documents attestant des ressources parmi les documents suivants :",
  },
  II: {
    A: "A. - Pour les cautions personnes physiques, une pièce justificative d'identité en cours de validité, comportant la photographie du titulaire parmi les documents suivants :",
    B: "B. - Pour les cautions personnes morales les deux justificatifs :",
    C: "C. - Une seule pièce justificative de domicile parmi les documents suivants :",
    D: "D. - Un ou plusieurs documents attestant des activités professionnelles parmi les documents suivants :",
    E: "E. - Un ou plusieurs documents attestant des ressources parmi les documents suivants :",
  },
};

/** Libellés courts des groupes du menu (le texte complet de la rubrique s'affiche sous le menu). */
export const GROUPES_DECRET: Record<AnnexeDecret, Record<string, string>> = {
  I: { A: "Identité (une pièce)", B: "Domicile (une seule pièce)", C: "Activités professionnelles", D: "Ressources" },
  II: {
    A: "Identité de la caution personne physique (une pièce)",
    B: "Caution personne morale (les deux justificatifs)",
    C: "Domicile (une seule pièce)",
    D: "Activités professionnelles",
    E: "Ressources",
  },
};

const un = (annexe: AnnexeDecret, rubrique: string, numero: number, texte: string, libelle?: string): PieceDecret => ({
  code: `${annexe}-${rubrique}-${numero}`, annexe, rubrique, unique: false, libelle: libelle ?? texte.replace(/[.;]$/, ""), texte, type: "justificatif",
});

export const PIECES_DECRET: PieceDecret[] = [
  // ── Annexe I — candidats à la location
  {
    code: "I-A", annexe: "I", rubrique: "A", unique: true, type: "piece_identite",
    libelle: "Une pièce justificative d'identité en cours de validité, comportant la photographie du titulaire",
    texte:
      "Une pièce justificative d'identité en cours de validité, comportant la photographie du titulaire parmi les documents suivants : " +
      "1. Carte nationale d'identité française ou étrangère. " +
      "2. Passeport français ou étranger. " +
      "3. Permis de conduire français ou étranger. " +
      "4. Document justifiant du droit au séjour du candidat à la location étranger, notamment, carte de séjour temporaire, carte de résident, carte de ressortissant d'un Etat membre de l'Union européenne ou de l'Espace économique européen.",
  },
  {
    code: "I-B", annexe: "I", rubrique: "B", unique: true, type: "justificatif",
    libelle: "Une seule pièce justificative de domicile",
    texte:
      "Une seule pièce justificative de domicile parmi les documents suivants : " +
      "1. Trois dernières quittances de loyer ou, à défaut, attestation du précédent bailleur, ou de son mandataire, indiquant que le locataire est à jour de ses loyers et charges. " +
      "2. Attestation d'élection de domicile établissant le lien avec un organisme agréé au titre de l'article L. 264-2 du code de l'action sociale et des familles. " +
      "3. Attestation sur l'honneur de l'hébergeant indiquant que le candidat à la location réside à son domicile. " +
      "4. Dernier avis de taxe foncière ou, à défaut, titre de propriété de la résidence principale.",
  },
  un("I", "C", 1, "Contrat de travail ou de stage ou, à défaut, une attestation de l'employeur précisant l'emploi et la rémunération proposée, la date d'entrée en fonctions envisagée et, le cas échéant, la durée de la période d'essai.", "Contrat de travail ou de stage ou, à défaut, une attestation de l'employeur"),
  un("I", "C", 2, "L'extrait K ou K bis du registre du commerce et des sociétés de moins de trois mois pour une entreprise commerciale."),
  un("I", "C", 3, "La fiche d'immatriculation au Registre national des entreprises de moins de trois mois pour une entreprise du secteur des métiers et de l'artisanat.", "La fiche d'immatriculation au Registre national des entreprises de moins de trois mois"),
  un("I", "C", 4, "La copie du certificat d'identification de l'INSEE, comportant les numéros d'identification, pour un travailleur indépendant.", "La copie du certificat d'identification de l'INSEE, comportant les numéros d'identification"),
  un("I", "C", 5, "La copie de la carte professionnelle pour une profession libérale."),
  un("I", "C", 6, "Toute pièce récente attestant de l'activité pour les autres professionnels."),
  un("I", "C", 7, "Carte d'étudiant ou certificat de scolarité pour l'année en cours."),
  un("I", "D", 1, "Le dernier ou avant-dernier avis d'imposition ou de non-imposition et, lorsque tout ou partie des revenus perçus n'a pas été imposé en France mais dans un autre Etat ou territoire, le dernier ou avant-dernier avis d'imposition à l'impôt ou aux impôts qui tiennent lieu d'impôt sur le revenu dans cet Etat ou territoire ou un document en tenant lieu établi par l'administration fiscale de cet Etat ou territoire.", "Le dernier ou avant-dernier avis d'imposition ou de non-imposition"),
  un("I", "D", 2, "Trois derniers bulletins de salaires."),
  un("I", "D", 3, "Justificatif de versement des indemnités de stage."),
  un("I", "D", 4, "Les deux derniers bilans ou, à défaut, une attestation de ressources pour l'exercice en cours délivré par un comptable pour les professions non salariées.", "Les deux derniers bilans ou, à défaut, une attestation de ressources pour l'exercice en cours"),
  un("I", "D", 5, "Justificatif de versement des indemnités, retraites, pensions, prestations sociales et familiales et allocations perçues lors des trois derniers mois ou justificatif de l'ouverture des droits, établis par l'organisme payeur.", "Justificatif de versement des indemnités, retraites, pensions, prestations sociales et familiales et allocations"),
  un("I", "D", 6, "Attestation de simulation établie par l'organisme payeur ou simulation établie par le locataire relative aux aides au logement.", "Attestation de simulation établie par l'organisme payeur ou simulation établie par le locataire"),
  un("I", "D", 7, "Avis d'attribution de bourse pour les étudiants boursiers."),
  un("I", "D", 8, "Titre de propriété d'un bien immobilier ou dernier avis de taxe foncière."),
  un("I", "D", 9, "Justificatif de revenus fonciers, de rentes viagères ou de revenus de valeurs et capitaux mobiliers."),

  // ── Annexe II — cautions
  {
    code: "II-A", annexe: "II", rubrique: "A", unique: true, type: "piece_identite",
    libelle: "Une pièce justificative d'identité en cours de validité, comportant la photographie du titulaire (caution)",
    texte:
      "Pour les cautions personnes physiques, une pièce justificative d'identité en cours de validité, comportant la photographie du titulaire parmi les documents suivants : " +
      "1. Carte nationale d'identité française ou étrangère ; " +
      "2. Passeport français ou étranger ; " +
      "3. Permis de conduire français ou étranger ;",
  },
  un("II", "B", 1, "Extrait K bis original de moins de trois mois de la société ou les statuts ou toute autre pièce justifiant de l'existence légale de la personne, faisant apparaître le nom du responsable et l'adresse de l'organisme ainsi que la preuve qu'une déclaration a été effectuée auprès d'une administration, une juridiction ou un organisme professionnel.", "Extrait K bis original de moins de trois mois de la société ou les statuts"),
  un("II", "B", 2, "Justificatif d'identité du représentant de la personne morale figurant sur l'extrait K bis ou les statuts."),
  {
    code: "II-C", annexe: "II", rubrique: "C", unique: true, type: "justificatif",
    libelle: "Une seule pièce justificative de domicile (caution)",
    texte:
      "Une seule pièce justificative de domicile parmi les documents suivants : " +
      "1. Dernière quittance de loyer. " +
      "2. Facture d'eau, de gaz ou d'électricité de moins de trois mois. " +
      "3. Attestation d'assurance logement de moins de trois mois. " +
      "4. Dernier avis de taxe foncière ou, à défaut, titre de propriété de la résidence principale.",
  },
  un("II", "D", 1, "Contrat de travail ou de stage ou, à défaut, une attestation de l'employeur précisant l'emploi et la rémunération proposée, la date d'entrée en fonctions envisagée et le cas échéant la durée de la période d'essai.", "Contrat de travail ou de stage ou, à défaut, une attestation de l'employeur"),
  un("II", "D", 2, "L'extrait K ou K bis du registre du commerce et des sociétés datant de moins de trois mois pour une entreprise commerciale.", "L'extrait K ou K bis du registre du commerce et des sociétés datant de moins de trois mois"),
  un("II", "D", 3, "La fiche d'immatriculation au Registre national des entreprises de moins de trois mois pour une entreprise du secteur des métiers et de l'artisanat.", "La fiche d'immatriculation au Registre national des entreprises de moins de trois mois"),
  un("II", "D", 4, "La copie du certificat d'identification de l'INSEE, comportant les numéros d'identification, pour un travailleur indépendant.", "La copie du certificat d'identification de l'INSEE, comportant les numéros d'identification"),
  un("II", "D", 5, "La copie de la carte professionnelle pour une profession libérale."),
  un("II", "D", 6, "Toute pièce récente attestant de l'activité pour les autres professionnels."),
  un("II", "E", 1, "Dernier avis d'imposition ou de non-imposition et, lorsque tout ou partie des revenus perçus n'a pas été imposé en France mais dans un autre Etat ou territoire, le dernier avis d'imposition à l'impôt ou aux impôts qui tiennent lieu d'impôt sur le revenu dans cet Etat ou territoire ou un document en tenant lieu établi par l'administration fiscale de cet Etat ou territoire.", "Dernier avis d'imposition ou de non-imposition"),
  un("II", "E", 2, "Titre de propriété d'un bien immobilier ou dernier avis de taxe foncière."),
  un("II", "E", 3, "Trois derniers bulletins de salaires."),
  un("II", "E", 4, "Les deux derniers bilans ou, à défaut, une attestation de ressources pour l'exercice en cours délivré par un comptable pour les professions non salariées.", "Les deux derniers bilans ou, à défaut, une attestation de ressources pour l'exercice en cours"),
  un("II", "E", 5, "Justificatif de versement des indemnités, retraites, pensions, prestations sociales et familiales et allocations perçues lors des trois derniers mois ou justificatif de l'ouverture des droits, établis par l'organisme payeur.", "Justificatif de versement des indemnités, retraites, pensions, prestations sociales et familiales et allocations"),
  un("II", "E", 6, "Justificatif de revenus fonciers, de rentes viagères ou de revenus de valeurs et capitaux mobiliers."),
];

/**
 * Ce que Gerimmo laisse demander à une personne, selon sa place :
 *  - `libre` : elle a un bail signé comme locataire en cours (le décret vise le candidat) → nom de pièce libre, comme avant ;
 *  - sinon, les annexes à proposer : II si elle est caution d'un bail (signé ou en préparation), I si elle est candidate
 *    (un bail en préparation comme locataire). Une caution qui prépare aussi son propre bail a les deux.
 *  - Reprise T3R-2 : `libre` aussi pour une personne qui n'est ni caution ni locataire d'un bail en préparation mais qui a
 *    eu un bail signé, même terminé (locataire sorti : RIB pour restituer le dépôt…), ou qui détient un lot ou a un
 *    mandat (propriétaire, propriétaire mandant) : ce n'est pas un candidat. Le lot T3 lui retirait le nom libre.
 *  - Personne d'autre (aucun bail, aucun lot, aucun mandat : un candidat dont le bail n'est pas encore créé) : annexe I.
 */
export type RegimePieces = { libre: true; annexes: [] } | { libre: false; annexes: AnnexeDecret[] };

export function regimePieces(p: {
  locataireBailSigne: boolean; caution: boolean; locataireEnPreparation: boolean;
  /** Bail signé terminé (titulaire), départ enregistré d'un bail signé (colocataire), lot détenu ou mandat. */
  ancienLocataireOuProprietaire: boolean;
}): RegimePieces {
  if (p.locataireBailSigne) return { libre: true, annexes: [] };
  if (p.caution) return { libre: false, annexes: p.locataireEnPreparation ? ["I", "II"] : ["II"] };
  if (p.locataireEnPreparation) return { libre: false, annexes: ["I"] };
  if (p.ancienLocataireOuProprietaire) return { libre: true, annexes: [] };
  return { libre: false, annexes: ["I"] };
}

export function pieceDecret(code: string, annexes: readonly AnnexeDecret[]): PieceDecret | null {
  return PIECES_DECRET.find((p) => p.code === code && annexes.includes(p.annexe)) ?? null;
}

/** La note jointe à la demande : le texte du décret quand le nom enregistré ne le contient pas en entier. */
export function noteDecret(piece: PieceDecret): string | null {
  return piece.texte.replace(/[.;]$/, "") === piece.libelle ? null : piece.texte;
}

/**
 * « Une pièce », « une seule pièce » : la demande de la même rubrique déjà EN COURS, s'il y en a une (`libellesEnCours` :
 * les noms des demandes non satisfaites). Reconnue à son nom, celui que ce fichier enregistre : une ancienne demande au
 * nom libre n'est pas comptée. Reprise T3R-6 : une demande déjà satisfaite ne bloque plus (pièce périmée, illisible).
 */
export function demandeUniqueDejaFaite(piece: PieceDecret, libellesEnCours: readonly string[]): string | null {
  if (!piece.unique) return null;
  return libellesEnCours.find((l) => l === piece.libelle) ?? null;
}

export const REFERENCE_PIECES_DECRET = "décret n° 2015-1437 du 5 novembre 2015";

/** Reprise T3R-4 : la note d'une demande est-elle le texte d'une pièce de la liste (à reproduire en entier) ? */
export function estTexteDecret(note: string | null | undefined): boolean {
  return Boolean(note) && PIECES_DECRET.some((p) => p.texte === note);
}
