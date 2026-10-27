export type AmbianceAccueilId =
  | "printemps"
  | "ete"
  | "automne"
  | "hiver"
  | "nouvel-an"
  | "saint-valentin"
  | "paques"
  | "fete-travail"
  | "fete-meres"
  | "fete-peres"
  | "fete-musique"
  | "14-juillet"
  | "rentree"
  | "halloween"
  | "noel";

export type AmbianceAccueil = {
  readonly id: AmbianceAccueilId;
  readonly libelle: string;
  readonly image: string;
};

const LIBELLES: Record<AmbianceAccueilId, string> = {
  printemps: "Printemps",
  ete: "Été",
  automne: "Automne",
  hiver: "Hiver",
  "nouvel-an": "Nouvel An",
  "saint-valentin": "Saint-Valentin",
  paques: "Pâques",
  "fete-travail": "Fête du Travail",
  "fete-meres": "Fête des Mères",
  "fete-peres": "Fête des Pères",
  "fete-musique": "Fête de la Musique",
  "14-juillet": "14 Juillet",
  rentree: "Rentrée",
  halloween: "Halloween",
  noel: "Noël",
};

const MILLISECONDES_PAR_JOUR = 86_400_000;

/** UTC sert uniquement à compter les jours civils, sans horloge ni fuseau de la machine. */
function numeroJour(annee: number, mois: number, jour: number): number {
  const date = new Date(0);
  // Date.UTC traite les années 0–99 comme 1900–1999 ; setUTCFullYear conserve l'année.
  date.setUTCFullYear(annee, mois - 1, jour);
  return date.getTime() / MILLISECONDES_PAR_JOUR;
}

function jourSemaine(numero: number): number {
  return ((numero + 4) % 7 + 7) % 7;
}

/** Comput grégorien, formulaire présenté par l'IMCCE (lesdatesdepaques.pdf). */
function dimanchePaques(annee: number): number {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const total = h + l - 7 * m + 114;
  return numeroJour(annee, Math.floor(total / 31), total % 31 + 1);
}

function lireJour(jourParis: string) {
  const morceaux = typeof jourParis === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(jourParis);
  if (!morceaux) throw new RangeError("Une date valide au format AAAA-MM-JJ est requise.");

  const [, anneeTexte, moisTexte, jourTexte] = morceaux;
  const annee = Number(anneeTexte);
  const mois = Number(moisTexte);
  const jour = Number(jourTexte);
  const bissextile = annee % 4 === 0 && (annee % 100 !== 0 || annee % 400 === 0);
  const joursDuMois = [31, bissextile ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (annee < 1 || mois < 1 || mois > 12 || jour < 1 || jour > joursDuMois[mois - 1]) {
    throw new RangeError("Une date valide au format AAAA-MM-JJ est requise.");
  }
  return { annee, mois, jour };
}

/**
 * Le jour civil est fourni par aujourdhuiParis, sans conversion ni horloge implicite.
 * Les fenêtres sont un choix éditorial ; la rentrée ne prétend pas donner une date scolaire.
 * Les fêtes passent avant les quatre saisons météorologiques.
 */
export function ambianceAccueil(jourParis: string): AmbianceAccueil {
  const { annee, mois, jour } = lireJour(jourParis);
  const numero = numeroJour(annee, mois, jour);
  const paques = dimanchePaques(annee);
  const finMai = numeroJour(annee, 5, 31);
  const dernierDimancheMai = finMai - jourSemaine(finMai);
  // France : dernier dimanche de mai, report au dimanche suivant si c'est la Pentecôte.
  // Code de l'action sociale et des familles, article D215-2.
  const feteMeres = dernierDimancheMai === paques + 49 ? dernierDimancheMai + 7 : dernierDimancheMai;
  const debutJuin = numeroJour(annee, 6, 1);
  const fetePeres = debutJuin + (7 - jourSemaine(debutJuin)) % 7 + 14;
  const moisJour = mois * 100 + jour;

  let id: AmbianceAccueilId;
  if (moisJour >= 1229 || moisJour <= 104) id = "nouvel-an";
  else if (moisJour >= 1201 && moisJour <= 1228) id = "noel";
  else if (moisJour >= 1020 && moisJour <= 1031) id = "halloween";
  else if (moisJour >= 207 && moisJour <= 214) id = "saint-valentin";
  else if (numero >= paques - 7 && numero <= paques + 1) id = "paques";
  else if (moisJour >= 429 && moisJour <= 501) id = "fete-travail";
  else if (numero >= feteMeres - 5 && numero <= feteMeres) id = "fete-meres";
  // Le jour des Pères reste prioritaire, y compris s'il tombe le 21 juin.
  // La musique paraît les autres jours du 19 au 21 : aucune fête n'est masquée une année entière.
  else if (numero === fetePeres) id = "fete-peres";
  else if (moisJour >= 619 && moisJour <= 621) id = "fete-musique";
  else if (numero >= fetePeres - 5 && numero < fetePeres) id = "fete-peres";
  else if (moisJour >= 710 && moisJour <= 714) id = "14-juillet";
  else if (moisJour >= 825 && moisJour <= 907) id = "rentree";
  else if (mois >= 3 && mois <= 5) id = "printemps";
  else if (mois >= 6 && mois <= 8) id = "ete";
  else if (mois >= 9 && mois <= 11) id = "automne";
  else id = "hiver";

  return { id, libelle: LIBELLES[id], image: `/illustrations/accueil-evenements/${id}.webp` };
}
