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
// Les mots de la fiche du bail (« Signé », « En cours ») pour la liste de choix des documents (phase 3, S34).
export const ETATS_EDL: Record<string, string> = {
  signe: "Signé",
  brouillon: "En cours",
};

// Statuts d'un appel de loyer (échéancier agence et espace locataire)
export const STATUTS_APPEL_LOYER: Record<string, string> = {
  paye: "Payé",
  au_decompte: "Repris au décompte",
  non_du: "Non dû",
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

// BAIL DÉJÀ EN COURS (décision B du dirigeant, 20/11/2026) : un bail dont la date d'entrée est strictement passée
// s'active par le dépôt de son contrat signé, sans « mise en location » préalable du logement ; les diagnostics absents
// ou expirés ne le bloquent plus et restent des actions à mener (lib/actions-attendues.ts).
//
// Comme pour les mentions : la base est seule à DÉCIDER (`bail_deja_en_cours`, lue par `controler_mise_en_location`,
// migration 20261120190000) ; cette fonction-ci sert à ANNONCER, sur la fiche du bail, que le dépôt est ouvert.
// tests/bail-deja-en-cours-base.test.ts compare les deux sur la veille, le jour même et le lendemain.
// `aujourdHui` : le jour de Paris (aujourdhuiParis()), au format AAAA-MM-JJ comme les dates de la base.
export function bailDejaEnCours(dateDebut: string | null | undefined, aujourdHui: string): boolean {
  return typeof dateDebut === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateDebut) && dateDebut < aujourdHui;
}

// DATE DE BASCULE (20/11/2026) : un bail repris en cours ne réclame pas les loyers d'avant son arrivée sur Gerimmo.
// Activé un mois postérieur à celui de l'entrée, il n'est suivi qu'à partir du mois de son activation
// (`baux.loyers_suivis_depuis`, migration 20261120200000) : l'échéancier commence là, pas deux ans plus tôt.
//
// La base est seule à DÉCIDER (`premier_mois_suivi`, posée par le déclencheur à l'activation) ; cette fonction-ci sert à
// ANNONCER, avant le dépôt du contrat signé, à partir de quel mois les loyers seront suivis.
// tests/loyers-suivis-depuis-base.test.ts compare les deux. Rend le 1er du mois (AAAA-MM-01), ou null quand
// l'échéancier partira de l'entrée (bail activé le mois de son entrée, ou avant).
export function premierMoisSuivi(dateDebut: string | null | undefined, aujourdHui: string): string | null {
  const jour = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof dateDebut !== "string" || !jour.test(dateDebut) || !jour.test(aujourdHui)) return null;
  return dateDebut.slice(0, 7) < aujourdHui.slice(0, 7) ? `${aujourdHui.slice(0, 7)}-01` : null;
}

// La contrepartie de la date de bascule : la régularisation des charges compare les charges réelles de l'exercice aux
// provisions APPELÉES dans Gerimmo. Un exercice commencé avant le premier mois suivi ne s'y régularise donc pas (la base
// le refuse : déclencheur `regularisations_avant_bascule`). Le premier exercice régularisable est celui de la bascule
// si elle tombe en janvier, le suivant sinon. Rien pour un bail sans date de bascule.
export function premierExerciceRegularisable(loyersSuivisDepuis: string | null | undefined): number | null {
  const lu = typeof loyersSuivisDepuis === "string" ? /^(\d{4})-(\d{2})-\d{2}$/.exec(loyersSuivisDepuis) : null;
  if (!lu) return null;
  return Number(lu[1]) + (lu[2] === "01" ? 0 : 1);
}

const MOIS_EN_CLAIR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** « novembre 2026 » pour « 2026-11-01 ». Rien pour une date mal formée : l'écran se tait plutôt que d'inventer. */
export function moisEnClair(date: string | null | undefined): string | null {
  const lu = typeof date === "string" ? /^(\d{4})-(\d{2})-\d{2}$/.exec(date) : null;
  const mois = lu ? MOIS_EN_CLAIR[Number(lu[2]) - 1] : undefined;
  return lu && mois ? `${mois} ${lu[1]}` : null;
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
export const MESSAGE_SOLDE_NON_APPELE = "Ce solde n’est pas appelé : il sera repris au décompte de sortie.";

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
// Depuis la décision Q43 du 24/11/2026, cette « date d'effet » n'est plus la date d'application du loyer révisé : elle
// reste la date à laquelle la révision est acquise (elle sert à compter une révision par année de bail). Le loyer révisé
// s'applique au premier terme qui suit la demande : voir `premierTermeApresDemande`.
export function datesRevisionIrl(
  dateDebut: string | null | undefined,
  dateDemande: string
): { echeance: string; dateEffet: string } | null {
  const echeance = derniereDateAnniversaire(dateDebut, dateDemande);
  if (!echeance) return null;
  return { echeance, dateEffet: dateDemande > echeance ? dateDemande : echeance };
}

// Décision Q23 du 24/11/2026 : la révision d'une année se demande pendant un an à compter de sa date de révision
// (`echeance`, une date anniversaire du bail). La date limite est la veille de la date anniversaire suivante : révision
// prévue le 15/10/2025, date limite le 14/10/2026 (exemple de la fiche Service-Public F1311 lue le 24/11/2026 : 13 mars
// 2025 → 12 mars 2026). Miroir de `reviser_loyer` (migration 20261124100000), qui refuse au-delà.
export function dateLimiteRevision(dateDebut: string | null | undefined, echeance: string): string | null {
  if (!dateDebut) return null;
  // La date anniversaire suivante est la dernière atteinte un an et un jour plus tard (le 29/02 se replie comme en base).
  const [a, m, j] = echeance.slice(0, 10).split("-").map(Number);
  const suivante = derniereDateAnniversaire(dateDebut, new Date(Date.UTC(a + 1, m - 1, j + 1)).toISOString().slice(0, 10));
  if (!suivante || suivante <= echeance.slice(0, 10)) return null;
  const veille = new Date(`${suivante}T00:00:00Z`);
  veille.setUTCDate(veille.getUTCDate() - 1);
  return veille.toISOString().slice(0, 10);
}

// Décision Q43 du 24/11/2026 : le loyer révisé ne s'applique jamais à des jours antérieurs à la demande. Il s'applique au
// premier terme dont la période COMMENCE après la date de la demande. Les termes sont des mois civils : c'est le 1er du
// mois qui suit la demande (demande du 15/10 ou du 31/10 → terme de novembre ; demande du 01/11 → terme de décembre).
// La base retient en plus qu'un terme déjà appelé n'est pas modifié (`revisions_loyer.premier_terme`).
export function premierTermeApresDemande(dateDemande: string): string {
  const [a, m] = dateDemande.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
}

// Reprise du lot D2 (24/11/2026) : le premier terme appelé au loyer révisé, tel que `reviser_loyer` l'écrit sur la révision
// (migration 20261124130000). Antidater la demande ne fait pas gagner un terme : on part du plus tardif entre la date de
// la demande et le jour de l'enregistrement, et le terme retenu suit toujours le dernier terme déjà appelé.
export function premierTermeRevise(dateDemande: string, jourEnregistrement: string, dernierTermeAppele?: string | null): string {
  const terme = premierTermeApresDemande(dateDemande > jourEnregistrement ? dateDemande : jourEnregistrement);
  const apresAppels = dernierTermeAppele ? premierTermeApresDemande(dernierTermeAppele) : terme;
  return apresAppels > terme ? apresAppels : terme;
}

// Seconde reprise du lot D2 (24/11/2026) : la révision d'une année non faite se reconnaît à l'ANNÉE DE BAIL. À partir de la
// deuxième année de bail, s'il n'existe aucune révision pour l'année de bail précédente, la base exige l'indice du même
// trimestre de l'année précédente et calcule sur un an (elle ne se fie plus à la seule année lue dans le libellé du
// trimestre, qui peut manquer). Miroir de `reviser_loyer` (migration 20261124150000) ; le formulaire s'en sert pour
// afficher le champ de cet indice. L'année de bail d'une date est le nombre de dates anniversaires atteintes.
export function indicePrecedentExige(
  dateDebut: string | null | undefined,
  dateDemande: string,
  revisions: { date_effet: string }[],
): boolean {
  if (!dateDebut) return false;
  const anneeDeBail = (jour: string) => {
    const anniversaire = derniereDateAnniversaire(dateDebut, jour.slice(0, 10));
    return anniversaire ? Number(anniversaire.slice(0, 4)) - Number(dateDebut.slice(0, 4)) : 0;
  };
  const annee = anneeDeBail(dateDemande);
  return annee >= 2 && !revisions.some((r) => anneeDeBail(r.date_effet) === annee - 1);
}

// Reprise du lot D2 (24/11/2026) : dès qu'une révision est enregistrée, le bail porte le loyer révisé, alors que ce loyer
// ne s'applique qu'à partir de son premier terme. Tant que ce terme n'est pas commencé, ce qu'on affiche ou atteste comme
// « le loyer » est celui du terme en cours (le loyer d'avant la révision), et le loyer révisé s'annonce avec son terme.
// Une seule fonction pour l'attestation de loyer, le dossier CAF, l'attestation du locataire et son espace.
//
// Seconde reprise (24/11/2026). La règle, telle quelle :
//  - le loyer du terme en cours est l'« ancien loyer » de la PLUS ANCIENNE révision en attente (premier terme après le mois
//    en cours). Deux révisions peuvent attendre le même terme : celle de l'année passée, demandée la veille de la date
//    anniversaire (700 → 714 €), et celle de l'année qui commence, demandée le lendemain (714 → 728 €). Le terme en cours
//    reste à 700 € ;
//  - ce qui s'annonce est le loyer du bail (728 €), à compter de ce premier terme ;
//  - un bail qui finit avant ce premier terme n'annonce rien : le loyer révisé ne lui sera jamais appelé.
// Les révisions doivent arriver rangées par premier terme puis par date d'enregistrement : c'est l'ordre que rend
// `revisions_de_mon_loyer_locataire`, et celui que demande le dossier du bail. Le tri ci-dessous garde cet ordre à
// premier terme égal.
export type RevisionDuLoyer = { ancien_loyer: number | string; nouveau_loyer: number | string; premier_terme: string | null };
export type LoyerDuTerme = {
  /** Le loyer hors charges du terme en cours. */
  loyer: number | null;
  /** Le loyer révisé qui n'est pas encore appliqué : son montant, son premier terme et le dernier terme à l'ancien loyer (1er du mois). */
  aVenir: { loyer: number; premierTerme: string; dernierTermeAvant: string } | null;
};
export function loyerDuTermeEnCours(
  loyerDuBail: number | string | null,
  revisions: RevisionDuLoyer[],
  aujourdhui: string,
  dateFin?: string | null,
): LoyerDuTerme {
  const loyer = loyerDuBail === null ? null : Number(loyerDuBail);
  const moisEnCours = `${aujourdhui.slice(0, 7)}-01`;
  const centimes = (v: number | string) => Math.round(Number(v) * 100);
  const enAttente = revisions
    .filter((r) => r.premier_terme !== null && r.premier_terme.slice(0, 10) > moisEnCours)
    .sort((a, b) => a.premier_terme!.localeCompare(b.premier_terme!));
  const premiere = enAttente[0];
  const derniere = enAttente[enAttente.length - 1];
  // On s'en tient au loyer du bail si rien n'attend, si le bail ne porte pas le loyer de la dernière révision en attente
  // (un avenant est passé depuis), ou si le loyer ne change pas.
  if (!premiere || loyer === null || centimes(derniere.nouveau_loyer) !== centimes(loyer) || centimes(premiere.ancien_loyer) === centimes(loyer)) {
    return { loyer, aVenir: null };
  }
  const premierTerme = premiere.premier_terme!.slice(0, 10);
  // Le bail finit avant le premier terme révisé : le terme en cours reste à l'ancien loyer, et rien ne s'annonce.
  if (dateFin && dateFin.slice(0, 10) < premierTerme) return { loyer: Number(premiere.ancien_loyer), aVenir: null };
  const [a, m] = premierTerme.split("-").map(Number);
  const dernierTermeAvant = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 10);
  return { loyer: Number(premiere.ancien_loyer), aVenir: { loyer, premierTerme, dernierTermeAvant } };
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
