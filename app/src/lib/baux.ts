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

// Exercice proposé par défaut pour la régularisation des charges (audit du
// 27/09) : l'année civile précédente (RM-3.9.1), ramenée dans la période du
// bail. Un bail de septembre 2026 ne couvre aucun jour de 2025 : proposer
// 2025 provoquait le refus « le bail ne couvre aucun jour de l'exercice ».
export function exerciceRegularisationParDefaut(
  dateDebut: string | null | undefined,
  dateFin: string | null | undefined,
  aujourdhui: string
): number {
  const anneeCourante = Number(aujourdhui.slice(0, 4));
  let annee = anneeCourante - 1;
  const fin = dateFin ? Number(dateFin.slice(0, 4)) : null;
  const debut = dateDebut ? Number(dateDebut.slice(0, 4)) : null;
  if (fin !== null && fin < annee) annee = fin;
  if (debut !== null && debut > annee) annee = Math.min(debut, anneeCourante);
  return annee;
}

// Dernière date anniversaire du bail atteinte à `aujourdhui` (AAAA-MM-JJ), ou
// null avant le premier anniversaire : la révision IRL prend effet à une date
// anniversaire (wiki « Révision annuelle IRL »). Le 29/02 se replie au 28/02
// les années non bissextiles, comme `date + interval 'n years'` en base.
export function derniereDateAnniversaire(dateDebut: string | null | undefined, aujourdhui: string): string | null {
  if (!dateDebut) return null;
  const [a, m, j] = dateDebut.slice(0, 10).split("-").map(Number);
  const anniversaire = (n: number) => {
    const dernier = new Date(Date.UTC(a + n, m, 0)).getUTCDate();
    return `${a + n}-${String(m).padStart(2, "0")}-${String(Math.min(j, dernier)).padStart(2, "0")}`;
  };
  let n = Number(aujourdhui.slice(0, 4)) - a;
  while (n >= 1 && anniversaire(n) > aujourdhui) n--;
  return n >= 1 ? anniversaire(n) : null;
}

// Révision IRL (art. 17-1 I de la loi du 6 juillet 1989, rédaction ALUR) :
// l'échéance est la dernière date anniversaire atteinte à la date de la
// DEMANDE ; la révision prend effet à cette échéance si elle est demandée ce
// jour-là, sinon à la date de la demande — jamais rétroactivement. Date
// d'effet = max(anniversaire, demande). Miroir de `reviser_loyer` (migration
// 20260929120000). null avant le premier anniversaire.
export function datesRevisionIrl(
  dateDebut: string | null | undefined,
  dateDemande: string
): { echeance: string; dateEffet: string } | null {
  const echeance = derniereDateAnniversaire(dateDebut, dateDemande);
  if (!echeance) return null;
  return { echeance, dateEffet: dateDemande > echeance ? dateDemande : echeance };
}

// Numéro (1 à 4) du trimestre IRL lu dans un libellé libre : « T2 2026 »,
// « 2e trimestre 2026 », « deuxième trimestre »… — miroir de
// `trimestre_irl_numero`. null quand le libellé ne se lit pas.
export function numeroTrimestreIrl(libelle: string | null | undefined): number | null {
  const v = (libelle ?? "").toLowerCase();
  let m = v.match(/(^|[^a-z0-9])t\s*([1-4])([^0-9]|$)/);
  if (m) return Number(m[2]);
  m = v.match(/(^|[^0-9])([1-4])\s*(er|re|e|è|ème|eme|nd|nde)?\s*trim/);
  if (m) return Number(m[2]);
  if (/premier\s+trim/.test(v)) return 1;
  if (/(deuxi[eè]me|second)\s+trim/.test(v)) return 2;
  if (/troisi[eè]me\s+trim/.test(v)) return 3;
  if (/quatri[eè]me\s+trim/.test(v)) return 4;
  return null;
}
