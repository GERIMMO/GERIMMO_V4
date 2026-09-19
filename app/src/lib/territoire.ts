// Le territoire : où Gerimmo est, département par département.
//
// PREMIÈRE BRIQUE DE L'EXPANSION TERRITORIALE (wiki : « Expansion territoriale
// autonome », 19/09). Avant de choisir où aller, savoir où l'on est — et cela
// se calcule avec ce qui est déjà saisi : le code postal des organisations et
// des biens. Aucune table nouvelle, aucune migration.
//
// CE FICHIER NE LIT PAS LA BASE. Il reçoit des lignes et rend un tableau par
// département : c'est ce qui le rend testable sans Postgres, et réutilisable
// tel quel par la routine mensuelle quand elle existera.
//
// LA GÉOGRAPHIE EST CELLE DES BIENS, PAS CELLE DU SIÈGE. Une agence d'Évry qui
// gère un immeuble à Massy et un autre à Antony est présente dans l'Essonne ET
// dans les Hauts-de-Seine. L'organisation se compte là où elle est domiciliée ;
// les biens, les lots et les baux se comptent là où ils sont.

export type Departement = { code: string; nom: string; region: string };

/**
 * Les 101 départements, avec leur région (découpage en vigueur depuis 2016).
 *
 * Référentiel : code officiel géographique de l'INSEE. Ce sont des données
 * publiques et stables ; elles sont recopiées ici pour ne pas dépendre d'un
 * réseau au moment de compter. La CONTIGUÏTÉ (quel département touche lequel)
 * n'y figure pas volontairement : elle se sourcera d'un référentiel, pas de
 * mémoire — c'est la brique du score.
 */
export const DEPARTEMENTS: readonly Departement[] = [
  // Auvergne-Rhône-Alpes
  { code: "01", nom: "Ain", region: "Auvergne-Rhône-Alpes" },
  { code: "03", nom: "Allier", region: "Auvergne-Rhône-Alpes" },
  { code: "07", nom: "Ardèche", region: "Auvergne-Rhône-Alpes" },
  { code: "15", nom: "Cantal", region: "Auvergne-Rhône-Alpes" },
  { code: "26", nom: "Drôme", region: "Auvergne-Rhône-Alpes" },
  { code: "38", nom: "Isère", region: "Auvergne-Rhône-Alpes" },
  { code: "42", nom: "Loire", region: "Auvergne-Rhône-Alpes" },
  { code: "43", nom: "Haute-Loire", region: "Auvergne-Rhône-Alpes" },
  { code: "63", nom: "Puy-de-Dôme", region: "Auvergne-Rhône-Alpes" },
  { code: "69", nom: "Rhône", region: "Auvergne-Rhône-Alpes" },
  { code: "73", nom: "Savoie", region: "Auvergne-Rhône-Alpes" },
  { code: "74", nom: "Haute-Savoie", region: "Auvergne-Rhône-Alpes" },
  // Bourgogne-Franche-Comté
  { code: "21", nom: "Côte-d'Or", region: "Bourgogne-Franche-Comté" },
  { code: "25", nom: "Doubs", region: "Bourgogne-Franche-Comté" },
  { code: "39", nom: "Jura", region: "Bourgogne-Franche-Comté" },
  { code: "58", nom: "Nièvre", region: "Bourgogne-Franche-Comté" },
  { code: "70", nom: "Haute-Saône", region: "Bourgogne-Franche-Comté" },
  { code: "71", nom: "Saône-et-Loire", region: "Bourgogne-Franche-Comté" },
  { code: "89", nom: "Yonne", region: "Bourgogne-Franche-Comté" },
  { code: "90", nom: "Territoire de Belfort", region: "Bourgogne-Franche-Comté" },
  // Bretagne
  { code: "22", nom: "Côtes-d'Armor", region: "Bretagne" },
  { code: "29", nom: "Finistère", region: "Bretagne" },
  { code: "35", nom: "Ille-et-Vilaine", region: "Bretagne" },
  { code: "56", nom: "Morbihan", region: "Bretagne" },
  // Centre-Val de Loire
  { code: "18", nom: "Cher", region: "Centre-Val de Loire" },
  { code: "28", nom: "Eure-et-Loir", region: "Centre-Val de Loire" },
  { code: "36", nom: "Indre", region: "Centre-Val de Loire" },
  { code: "37", nom: "Indre-et-Loire", region: "Centre-Val de Loire" },
  { code: "41", nom: "Loir-et-Cher", region: "Centre-Val de Loire" },
  { code: "45", nom: "Loiret", region: "Centre-Val de Loire" },
  // Corse
  { code: "2A", nom: "Corse-du-Sud", region: "Corse" },
  { code: "2B", nom: "Haute-Corse", region: "Corse" },
  // Grand Est
  { code: "08", nom: "Ardennes", region: "Grand Est" },
  { code: "10", nom: "Aube", region: "Grand Est" },
  { code: "51", nom: "Marne", region: "Grand Est" },
  { code: "52", nom: "Haute-Marne", region: "Grand Est" },
  { code: "54", nom: "Meurthe-et-Moselle", region: "Grand Est" },
  { code: "55", nom: "Meuse", region: "Grand Est" },
  { code: "57", nom: "Moselle", region: "Grand Est" },
  { code: "67", nom: "Bas-Rhin", region: "Grand Est" },
  { code: "68", nom: "Haut-Rhin", region: "Grand Est" },
  { code: "88", nom: "Vosges", region: "Grand Est" },
  // Hauts-de-France
  { code: "02", nom: "Aisne", region: "Hauts-de-France" },
  { code: "59", nom: "Nord", region: "Hauts-de-France" },
  { code: "60", nom: "Oise", region: "Hauts-de-France" },
  { code: "62", nom: "Pas-de-Calais", region: "Hauts-de-France" },
  { code: "80", nom: "Somme", region: "Hauts-de-France" },
  // Île-de-France
  { code: "75", nom: "Paris", region: "Île-de-France" },
  { code: "77", nom: "Seine-et-Marne", region: "Île-de-France" },
  { code: "78", nom: "Yvelines", region: "Île-de-France" },
  { code: "91", nom: "Essonne", region: "Île-de-France" },
  { code: "92", nom: "Hauts-de-Seine", region: "Île-de-France" },
  { code: "93", nom: "Seine-Saint-Denis", region: "Île-de-France" },
  { code: "94", nom: "Val-de-Marne", region: "Île-de-France" },
  { code: "95", nom: "Val-d'Oise", region: "Île-de-France" },
  // Normandie
  { code: "14", nom: "Calvados", region: "Normandie" },
  { code: "27", nom: "Eure", region: "Normandie" },
  { code: "50", nom: "Manche", region: "Normandie" },
  { code: "61", nom: "Orne", region: "Normandie" },
  { code: "76", nom: "Seine-Maritime", region: "Normandie" },
  // Nouvelle-Aquitaine
  { code: "16", nom: "Charente", region: "Nouvelle-Aquitaine" },
  { code: "17", nom: "Charente-Maritime", region: "Nouvelle-Aquitaine" },
  { code: "19", nom: "Corrèze", region: "Nouvelle-Aquitaine" },
  { code: "23", nom: "Creuse", region: "Nouvelle-Aquitaine" },
  { code: "24", nom: "Dordogne", region: "Nouvelle-Aquitaine" },
  { code: "33", nom: "Gironde", region: "Nouvelle-Aquitaine" },
  { code: "40", nom: "Landes", region: "Nouvelle-Aquitaine" },
  { code: "47", nom: "Lot-et-Garonne", region: "Nouvelle-Aquitaine" },
  { code: "64", nom: "Pyrénées-Atlantiques", region: "Nouvelle-Aquitaine" },
  { code: "79", nom: "Deux-Sèvres", region: "Nouvelle-Aquitaine" },
  { code: "86", nom: "Vienne", region: "Nouvelle-Aquitaine" },
  { code: "87", nom: "Haute-Vienne", region: "Nouvelle-Aquitaine" },
  // Occitanie
  { code: "09", nom: "Ariège", region: "Occitanie" },
  { code: "11", nom: "Aude", region: "Occitanie" },
  { code: "12", nom: "Aveyron", region: "Occitanie" },
  { code: "30", nom: "Gard", region: "Occitanie" },
  { code: "31", nom: "Haute-Garonne", region: "Occitanie" },
  { code: "32", nom: "Gers", region: "Occitanie" },
  { code: "34", nom: "Hérault", region: "Occitanie" },
  { code: "46", nom: "Lot", region: "Occitanie" },
  { code: "48", nom: "Lozère", region: "Occitanie" },
  { code: "65", nom: "Hautes-Pyrénées", region: "Occitanie" },
  { code: "66", nom: "Pyrénées-Orientales", region: "Occitanie" },
  { code: "81", nom: "Tarn", region: "Occitanie" },
  { code: "82", nom: "Tarn-et-Garonne", region: "Occitanie" },
  // Pays de la Loire
  { code: "44", nom: "Loire-Atlantique", region: "Pays de la Loire" },
  { code: "49", nom: "Maine-et-Loire", region: "Pays de la Loire" },
  { code: "53", nom: "Mayenne", region: "Pays de la Loire" },
  { code: "72", nom: "Sarthe", region: "Pays de la Loire" },
  { code: "85", nom: "Vendée", region: "Pays de la Loire" },
  // Provence-Alpes-Côte d'Azur
  { code: "04", nom: "Alpes-de-Haute-Provence", region: "Provence-Alpes-Côte d'Azur" },
  { code: "05", nom: "Hautes-Alpes", region: "Provence-Alpes-Côte d'Azur" },
  { code: "06", nom: "Alpes-Maritimes", region: "Provence-Alpes-Côte d'Azur" },
  { code: "13", nom: "Bouches-du-Rhône", region: "Provence-Alpes-Côte d'Azur" },
  { code: "83", nom: "Var", region: "Provence-Alpes-Côte d'Azur" },
  { code: "84", nom: "Vaucluse", region: "Provence-Alpes-Côte d'Azur" },
  // Outre-mer : chaque département est aussi une région
  { code: "971", nom: "Guadeloupe", region: "Guadeloupe" },
  { code: "972", nom: "Martinique", region: "Martinique" },
  { code: "973", nom: "Guyane", region: "Guyane" },
  { code: "974", nom: "La Réunion", region: "La Réunion" },
  { code: "976", nom: "Mayotte", region: "Mayotte" },
];

const PAR_CODE = new Map(DEPARTEMENTS.map((d) => [d.code, d]));

export function departement(code: string): Departement | undefined {
  return PAR_CODE.get(code);
}

/**
 * Le département d'un code postal — ou null si le code n'en est pas un.
 *
 * Deux exceptions à la règle « les deux premiers chiffres » : la Corse, où
 * 200xx–201xx est la Corse-du-Sud (2A) et 202xx–206xx la Haute-Corse (2B) ;
 * et l'outre-mer, où le département tient sur trois chiffres (971–976).
 * Un code qui commence par 98 (Monaco, Polynésie…) rend ses trois premiers
 * chiffres : il n'est dans aucun département français, et la page le dira
 * plutôt que de le ranger au hasard.
 */
export function departementDuCodePostal(codePostal: string | null | undefined): string | null {
  const c = (codePostal ?? "").replace(/\s/g, "");
  if (!/^\d{5}$/.test(c)) return null;
  if (c.startsWith("97") || c.startsWith("98")) return c.slice(0, 3);
  if (c.startsWith("20")) return Number(c) < 20200 ? "2A" : "2B";
  return c.slice(0, 2);
}

export type LigneOrganisation = {
  id: string;
  type: string | null;
  status: string;
  postal_code: string | null;
  created_at: string;
};
export type LigneBien = { id: string; organization_id: string; postal_code: string | null };
export type LigneLot = { id: string; bien_id: string; etat: string };
export type LigneBail = { id: string; lot_id: string; etat: string };

export type EmpreinteDepartement = {
  code: string;
  nom: string;
  region: string;
  /** Organisations domiciliées ici, hors archivées. */
  agences: number;
  proprietairesDirects: number;
  enEssai: number;
  actives: number;
  suspendues: number;
  /** Organisations créées dans le mois en cours. */
  inscriptionsDuMois: number;
  /** Ce qui est géré ici, quel que soit le siège de l'organisation. */
  biens: number;
  lots: number;
  bauxEnCours: number;
};

export type Empreinte = {
  /** Un rang par département où quelque chose existe, du plus actif au moins actif. */
  lignes: EmpreinteDepartement[];
  /** Ce qu'on n'a pas pu placer : dit, jamais tu. */
  sansCodePostal: { organisations: number; biens: number };
  /** Codes postaux valides mais hors des 101 départements (98…). */
  horsReferentiel: number;
};

const vide = (d: Departement): EmpreinteDepartement => ({
  code: d.code,
  nom: d.nom,
  region: d.region,
  agences: 0,
  proprietairesDirects: 0,
  enEssai: 0,
  actives: 0,
  suspendues: 0,
  inscriptionsDuMois: 0,
  biens: 0,
  lots: 0,
  bauxEnCours: 0,
});

/** Les baux qui occupent un lot aujourd'hui — même lecture que le portefeuille. */
const BAIL_EN_COURS = new Set(["actif", "preavis"]);

/**
 * L'empreinte de la plateforme, département par département.
 *
 * `aujourdhui` est injectable pour que « ce mois » soit testable ; le mois
 * est pris en UTC, comme `created_at` est enregistré.
 */
export function empreinteParDepartement(
  donnees: {
    organisations: LigneOrganisation[];
    biens: LigneBien[];
    lots: LigneLot[];
    baux: LigneBail[];
  },
  aujourdhui: Date = new Date()
): Empreinte {
  const rangs = new Map<string, EmpreinteDepartement>();
  const sansCodePostal = { organisations: 0, biens: 0 };
  let horsReferentiel = 0;

  const rang = (codePostal: string | null | undefined): EmpreinteDepartement | "absent" | "inconnu" => {
    const code = departementDuCodePostal(codePostal);
    if (!code) return "absent";
    const d = PAR_CODE.get(code);
    if (!d) return "inconnu";
    let r = rangs.get(code);
    if (!r) {
      r = vide(d);
      rangs.set(code, r);
    }
    return r;
  };

  const debutDuMois = Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), 1);

  for (const o of donnees.organisations) {
    // Une organisation archivée a quitté la plateforme : elle n'est plus « là ».
    if (o.status === "archivee") continue;
    const r = rang(o.postal_code);
    if (r === "absent") {
      sansCodePostal.organisations += 1;
      continue;
    }
    if (r === "inconnu") {
      horsReferentiel += 1;
      continue;
    }
    if (o.type === "proprietaire_direct") r.proprietairesDirects += 1;
    else r.agences += 1;
    if (o.status === "essai") r.enEssai += 1;
    else if (o.status === "active") r.actives += 1;
    else if (o.status === "suspendue") r.suspendues += 1;
    if (Date.parse(o.created_at) >= debutDuMois) r.inscriptionsDuMois += 1;
  }

  // Le département de chaque bien, pour y rattacher ses lots et ses baux.
  const departementDuBien = new Map<string, EmpreinteDepartement>();
  for (const b of donnees.biens) {
    const r = rang(b.postal_code);
    if (r === "absent") {
      sansCodePostal.biens += 1;
      continue;
    }
    if (r === "inconnu") {
      horsReferentiel += 1;
      continue;
    }
    r.biens += 1;
    departementDuBien.set(b.id, r);
  }

  // Un lot archivé n'est plus géré : ni compté, ni support d'un bail — un bail
  // resté « actif » sur un lot archivé est une incohérence de données, pas
  // une activité.
  const departementDuLot = new Map<string, EmpreinteDepartement>();
  for (const l of donnees.lots) {
    if (l.etat === "archive") continue;
    const r = departementDuBien.get(l.bien_id);
    if (!r) continue;
    departementDuLot.set(l.id, r);
    r.lots += 1;
  }

  for (const b of donnees.baux) {
    if (!BAIL_EN_COURS.has(b.etat)) continue;
    const r = departementDuLot.get(b.lot_id);
    if (r) r.bauxEnCours += 1;
  }

  const lignes = [...rangs.values()].sort(
    (a, b) =>
      b.bauxEnCours - a.bauxEnCours ||
      b.lots - a.lots ||
      b.biens - a.biens ||
      b.agences + b.proprietairesDirects - (a.agences + a.proprietairesDirects) ||
      a.code.localeCompare(b.code)
  );
  return { lignes, sansCodePostal, horsReferentiel };
}

export type EmpreinteRegion = {
  region: string;
  departements: number;
  organisations: number;
  biens: number;
  lots: number;
  bauxEnCours: number;
};

/** La même empreinte, remontée à la région — l'échelle du prochain saut. */
export function empreinteParRegion(lignes: EmpreinteDepartement[]): EmpreinteRegion[] {
  const parRegion = new Map<string, EmpreinteRegion>();
  for (const l of lignes) {
    let r = parRegion.get(l.region);
    if (!r) {
      r = { region: l.region, departements: 0, organisations: 0, biens: 0, lots: 0, bauxEnCours: 0 };
      parRegion.set(l.region, r);
    }
    r.departements += 1;
    r.organisations += l.agences + l.proprietairesDirects;
    r.biens += l.biens;
    r.lots += l.lots;
    r.bauxEnCours += l.bauxEnCours;
  }
  return [...parRegion.values()].sort(
    (a, b) => b.bauxEnCours - a.bauxEnCours || b.lots - a.lots || a.region.localeCompare(b.region)
  );
}
