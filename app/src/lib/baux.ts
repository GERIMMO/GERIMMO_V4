// Référentiels du bail et de ses objets liés — une seule source pour tous les
// écrans (fiche bail, fiche lot, espace locataire, exports). Les états rendus
// à l'écran passent par les puces charte v2, comme COULEURS_ETAT_LOT (lib/parc.ts).

export const TYPES_BAIL: Record<string, string> = {
  nu: "Nu",
  meuble: "Meublé",
  colocation: "Colocation",
};

export const ETATS_BAIL: Record<string, string> = {
  brouillon: "Brouillon",
  actif: "Actif",
  preavis: "Préavis",
  termine: "Terminé",
};

export const COULEURS_ETAT_BAIL: Record<string, string> = {
  brouillon: "puce puce-prep",
  actif: "puce puce-loue",
  preavis: "puce puce-prep",
  termine: "puce puce-grise",
};

export const ETATS_MANDAT: Record<string, string> = {
  brouillon: "Brouillon",
  a_signer: "À signer",
  actif: "Actif",
  preavis: "Préavis",
  resilie: "Résilié",
};

export const COULEURS_ETAT_MANDAT: Record<string, string> = {
  brouillon: "puce puce-prep",
  a_signer: "puce puce-prep",
  actif: "puce puce-loue",
  preavis: "puce puce-prep",
  resilie: "puce puce-grise",
};

// EDL : signé = acquis (vert doux), brouillon = préparation (enum base :
// brouillon | signe — la clé « en_cours » ne correspondait à rien)
export const COULEURS_ETAT_EDL: Record<string, string> = {
  signe: "puce puce-loue",
  brouillon: "puce puce-prep",
};

// Statuts d'un appel de loyer (échéancier agence et espace locataire)
export const STATUTS_APPEL_LOYER: Record<string, string> = {
  paye: "Payé",
  partiel: "Partiel",
  impaye: "Impayé",
  attendu: "À échoir",
};

export const COULEURS_STATUT_APPEL_LOYER: Record<string, string> = {
  paye: "puce puce-loue",
  partiel: "puce puce-prep",
  impaye: "puce puce-rouge",
  attendu: "puce puce-grise",
};

// Mentions obligatoires du contrat exigées À L'ACTIVATION — wiki « Mentions
// obligatoires du bail » (modèle-type du décret n° 2015-587) : date de prise
// d'effet (rubriques 1 et 4) et loyer hors charges (rubrique 5), le locataire
// principal valant désignation des parties (rubrique 1).
//
// La base est seule à REFUSER (`controler_mise_en_location`, et le déclencheur
// `baux_mentions_a_l_activation` quel que soit le chemin d'écriture) ; cette
// liste-ci ne sert qu'à ANNONCER, sur la fiche, ce qui manque avant le geste —
// l'agent ne doit pas découvrir le refus en déposant le PDF signé.
// Les libellés sont MOT POUR MOT ceux de `bail_mentions_manquantes_valeurs` en
// base : tests/mentions-bail-actif.test.ts compare les deux listes et casse si
// elles divergent. Dérivé du bail déjà chargé, sans aller-retour.
//
// Un brouillon amputé d'une mention reste enregistrable : c'est le bail qu'on
// prépare, l'exigence naît à l'activation.
export function mentionsObligatoiresManquantes(bail: {
  locataire_principal: string | null;
  date_debut: string | null;
  loyer_hc: number | string | null;
}): string[] {
  const manquantes: string[] = [];
  if (!bail.locataire_principal) manquantes.push("Locataire principal non désigné");
  if (!bail.date_debut) manquantes.push("Date de prise d'effet non renseignée");
  if (bail.loyer_hc === null || bail.loyer_hc === undefined || bail.loyer_hc === "")
    manquantes.push("Loyer hors charges non fixé");
  return manquantes;
}
