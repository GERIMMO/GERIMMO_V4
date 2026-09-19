// Où aller ensuite : noter les départements candidats, et décider du prochain.
//
// DEUXIÈME BRIQUE DE L'EXPANSION TERRITORIALE (wiki : « Expansion territoriale
// autonome », 19/09). L'empreinte dit où l'on est ; ce module met le marché en
// face et rend une liste ordonnée — puis une décision : le prochain
// département, et s'il faut changer de région.
//
// TROIS PRINCIPES, TENUS PAR LES TESTS.
//  · Rien n'est estimé. Une donnée absente vaut zéro dans le score ET figure
//    dans `manquants` : la page le dit, le compte rendu mensuel le dira.
//  · Le voisinage compte. On s'étend de proche en proche ; un département qui
//    touche plusieurs départements ouverts passe devant un département isolé
//    de même marché.
//  · La région se finit avant de changer — sauf si ce qui y reste n'en vaut
//    pas la peine (score sous le seuil). Le changement de région est
//    automatique : décision du porteur du projet, 19/09.
//
// Les poids sont des paramètres, pas des vérités : ils sont ici pour être lus,
// discutés et changés en un seul endroit.

import { DEPARTEMENTS, type EmpreinteDepartement } from "@/lib/territoire";

export type MarcheDepartement = {
  logements_loues_prive: number | null;
  agences: number | null;
  communes_zone_tendue: number | null;
};
export type Marche = {
  sources: { cle: string; libelle: string; fournisseur: string; url: string; recupere_le: string | null }[];
  departements: Record<string, MarcheDepartement>;
};
export type Voisinage = Record<string, string[]>;

export const POIDS = {
  /** Logements loués dans le parc privé : la taille du marché. */
  marche: 0.4,
  /** Agences en activité : à la fois prospects et concurrence. */
  agences: 0.2,
  /** Communes en zone tendue : là où la gestion locative a le plus d'enjeux. */
  tension: 0.15,
  /** Part des voisins déjà ouverts : on avance de proche en proche. */
  proximite: 0.25,
} as const;

/** En dessous, un département restant dans la région ne retient pas ; on change de région. */
export const SEUIL_PERTINENCE = 20;

export type Candidat = {
  code: string;
  nom: string;
  region: string;
  /** 0 à 100. */
  score: number;
  /** Chaque composante avant pondération, 0 à 100. */
  composantes: { marche: number; agences: number; tension: number; proximite: number };
  voisinsOuverts: string[];
  /** Les entrées absentes du marché — comptées zéro, dites ici. */
  manquants: string[];
};

/**
 * Un département est « ouvert » dès qu'une organisation y est domiciliée ou
 * qu'un bien y est géré : c'est là que la plateforme existe, même petitement.
 */
export function departementsOuverts(empreinte: EmpreinteDepartement[]): Set<string> {
  return new Set(
    empreinte.filter((l) => l.agences + l.proprietairesDirects > 0 || l.biens > 0).map((l) => l.code)
  );
}

/**
 * Rang en centiles parmi les candidats : la valeur la plus haute vaut 100, la
 * plus basse 0, un null vaut 0. Le rang plutôt que la valeur : des logements
 * se comptent en centaines de milliers, des agences en centaines — sans cela,
 * le poids réel ne serait pas celui qu'on a écrit.
 */
function centiles(valeurs: (number | null)[]): number[] {
  const presentes = valeurs.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (presentes.length === 0) return valeurs.map(() => 0);
  if (presentes.length === 1) return valeurs.map((v) => (v === null ? 0 : 100));
  return valeurs.map((v) => {
    if (v === null) return 0;
    // Part des présentes strictement inférieures, sur (n − 1) : min → 0, max → 100.
    const inferieures = presentes.filter((p) => p < v).length;
    return Math.round((inferieures / (presentes.length - 1)) * 100);
  });
}

/** Les candidats notés, du meilleur au moins bon. */
export function noterCandidats(entree: {
  empreinte: EmpreinteDepartement[];
  marche: Marche;
  voisinage: Voisinage;
}): Candidat[] {
  const ouverts = departementsOuverts(entree.empreinte);
  const candidats = DEPARTEMENTS.filter((d) => !ouverts.has(d.code));
  const marcheDe = (code: string): MarcheDepartement =>
    entree.marche.departements[code] ?? { logements_loues_prive: null, agences: null, communes_zone_tendue: null };

  const rangMarche = centiles(candidats.map((d) => marcheDe(d.code).logements_loues_prive));
  const rangAgences = centiles(candidats.map((d) => marcheDe(d.code).agences));
  const rangTension = centiles(candidats.map((d) => marcheDe(d.code).communes_zone_tendue));

  return candidats
    .map((d, i) => {
      const m = marcheDe(d.code);
      const voisins = entree.voisinage[d.code] ?? [];
      const voisinsOuverts = voisins.filter((v) => ouverts.has(v)).sort();
      const proximite = voisins.length === 0 ? 0 : Math.round((voisinsOuverts.length / voisins.length) * 100);
      const composantes = { marche: rangMarche[i], agences: rangAgences[i], tension: rangTension[i], proximite };
      const score = Math.round(
        composantes.marche * POIDS.marche +
          composantes.agences * POIDS.agences +
          composantes.tension * POIDS.tension +
          composantes.proximite * POIDS.proximite
      );
      const manquants = (
        [
          ["logements_loues_prive", m.logements_loues_prive],
          ["agences", m.agences],
          ["communes_zone_tendue", m.communes_zone_tendue],
        ] as const
      )
        .filter(([, v]) => v === null)
        .map(([k]) => k);
      return { code: d.code, nom: d.nom, region: d.region, score, composantes, voisinsOuverts, manquants };
    })
    .sort((a, b) => b.score - a.score || b.composantes.proximite - a.composantes.proximite || a.code.localeCompare(b.code));
}

export type Decision = {
  /** La région où l'on est le plus actif aujourd'hui — null si l'on n'est nulle part. */
  regionCourante: string | null;
  /** Le prochain département à ouvrir — null s'il n'en reste aucun. */
  prochain: Candidat | null;
  /** Vrai si le prochain n'est pas dans la région courante. */
  changementDeRegion: boolean;
  /** Ce qui a conduit là, en une phrase — pour le compte rendu. */
  raison: string;
};

/**
 * Le prochain département, et s'il faut changer de région.
 *
 * On reste dans la région courante tant qu'il y reste un candidat au-dessus
 * du seuil ; sinon le meilleur candidat, toutes régions confondues, l'emporte
 * — et c'est un changement de région, automatique.
 */
export function decider(
  empreinte: EmpreinteDepartement[],
  candidats: Candidat[],
  seuil: number = SEUIL_PERTINENCE
): Decision {
  // L'empreinte est déjà triée du plus actif au moins actif.
  const regionCourante = empreinte[0]?.region ?? null;
  if (candidats.length === 0) {
    return { regionCourante, prochain: null, changementDeRegion: false, raison: "Tous les départements sont ouverts." };
  }
  if (regionCourante) {
    const dansLaRegion = candidats.filter((c) => c.region === regionCourante && c.score >= seuil);
    if (dansLaRegion.length > 0) {
      const p = dansLaRegion[0];
      return {
        regionCourante,
        prochain: p,
        changementDeRegion: false,
        raison: `${p.nom} (${p.code}) est le meilleur candidat restant en ${regionCourante}, score ${p.score}.`,
      };
    }
  }
  const p = candidats[0];
  const restants = regionCourante ? candidats.filter((c) => c.region === regionCourante).length : 0;
  return {
    regionCourante,
    prochain: p,
    changementDeRegion: regionCourante !== null && p.region !== regionCourante,
    raison: regionCourante
      ? restants === 0
        ? `${regionCourante} est entièrement ouverte ; ${p.region} prend le relais avec ${p.nom} (${p.code}), score ${p.score}.`
        : `Les ${restants} département${restants > 1 ? "s" : ""} restant${restants > 1 ? "s" : ""} en ${regionCourante} sont sous le seuil de ${seuil} ; ${p.region} prend le relais avec ${p.nom} (${p.code}), score ${p.score}.`
      : `Aucun département ouvert : ${p.nom} (${p.code}) ouvre, score ${p.score}.`,
  };
}
