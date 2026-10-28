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
  // Un terme d'un mois postérieur à la fin du bail (congé saisi tard) : la base le compte à 0, aucune relance ne le
  // réclame (etat_loyers_bail_brut, migration 20261028100100).
  non_du: "Non dû — après la fin du bail",
};

export const COULEURS_STATUT_APPEL_LOYER: Record<string, string> = {
  paye: "puce puce-loue",
  partiel: "puce puce-prep",
  impaye: "puce puce-rouge",
  attendu: "puce puce-grise",
  non_du: "puce puce-grise",
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

// D38 (CHF-02, option A) : un exercice n'est terminé qu'une fois le 31/12 passé. Avant, les provisions appelées ne couvrent qu'une partie
// de l'année alors que les charges réelles saisies sont celles de l'année entière : la comparaison n'est pas homogène (le solde peut même
// changer de sens), et la régularisation émise ne se modifie plus (RM-3.9.7). Elle reste possible, sur confirmation explicite.
// `aujourdhui` : le jour de Paris (AAAA-MM-JJ). L'option B (refus avant le 31/12) est différée : avis spécialisé.
export function exerciceNonTermine(annee: number, aujourdhui: string): boolean {
  return annee >= Number(aujourdhui.slice(0, 4));
}

// D40 : « sera repris au décompte de sortie » n'est vrai que tant que le décompte de sortie (la restitution du dépôt) n'est pas finalisé. Un
// décompte finalisé est figé (`rafraichir_montants_restitution` refuse, `finaliser_decompte` garde les montants arrêtés) et aucun décompte
// rectificatif n'existe : le solde d'une régularisation émise après coup n'est repris nulle part, il se traite hors application.
// `inconnu` : la lecture de la restitution a échoué ; on ne promet alors rien.
export type EtatDecompteSortie = "non_finalise" | "finalise" | "inconnu";

export function etatDecompteSortie(restitution: { statut?: unknown } | null | undefined, erreur?: unknown): EtatDecompteSortie {
  if (erreur) return "inconnu";
  return restitution?.statut === "finalise" ? "finalise" : "non_finalise";
}

export function avertissementExerciceNonTermine(annee: number, decompte: EtatDecompteSortie = "non_finalise"): string {
  const debut = `Exercice ${annee} non terminé : comparaison non homogène. Les provisions ne couvrent que les mois déjà appelés, alors que les charges réelles saisies portent sur l’année entière : le solde calculé peut changer de sens (un complément dû au lieu d’un trop-perçu, ou l’inverse). Une régularisation enregistrée ne se modifie plus`;
  if (decompte === "finalise") return `${debut}. Le décompte de sortie de ce bail est déjà finalisé : son solde n’y sera pas repris, à traiter hors application.`;
  if (decompte === "inconnu") return `${debut}. Son solde sera repris au décompte de sortie, sauf si celui-ci est déjà finalisé (il se traite alors hors application).`;
  return `${debut}, et son solde sera repris au décompte de sortie.`;
}

export const LIBELLE_CONFIRMATION_EXERCICE_NON_TERMINE =
  "Exercice non terminé : comparaison non homogène. Je confirme l’enregistrement de cette régularisation, qui ne pourra plus être modifiée.";

// D40 (CHF-06, option A) : une régularisation émise en cours de bail n'écrit ni appel ni écriture au livre. Son solde est repris au décompte
// de sortie (montants_reels_bail), tant qu'il n'est pas finalisé. L'appel complémentaire ou l'avoir (option B) est différé : avis spécialisé.
// La phrase dite à l'émission. `etale` : le locataire a demandé les douze mensualités ; l'échéancier est enregistré mais aucune mensualité
// n'est appelée, ce que la phrase dit au lieu de juxtaposer « étalé » et « pas appelé ».
export function messageSoldeNonAppele(decompte: EtatDecompteSortie = "non_finalise", etale = false): string {
  const sujet = etale ? "Aucune mensualité n’est appelée par l’application" : "Ce solde n’est pas appelé";
  const solde = etale ? "le solde" : "il";
  if (decompte === "finalise") return `${sujet}, et le décompte de sortie est déjà finalisé : ${solde} n’y sera pas repris, à traiter hors application.`;
  if (decompte === "inconnu") return `${sujet}. L’état du décompte de sortie n’a pas pu être lu : s’il est déjà finalisé, ${solde} n’y sera pas repris et se traite hors application.`;
  return `${sujet} : ${solde} sera repris au décompte de sortie.`;
}

// La note sous le formulaire « Régulariser » : même fait, dit avant l'émission.
export function aideSoldeNonAppele(decompte: EtatDecompteSortie = "non_finalise"): string {
  if (decompte === "finalise") return "Le solde d’une régularisation n’est pas appelé. Le décompte de sortie de ce bail est déjà finalisé : le solde d’une nouvelle régularisation n’y sera pas repris, à traiter hors application.";
  if (decompte === "inconnu") return "Le solde d’une régularisation n’est pas appelé. L’état du décompte de sortie n’a pas pu être lu : s’il est déjà finalisé, le solde d’une nouvelle régularisation n’y sera pas repris.";
  return "Le solde d’une régularisation n’est pas appelé : il est repris au décompte de sortie.";
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
