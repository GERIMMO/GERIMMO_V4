// LA GRILLE TARIFAIRE — un seul endroit, en centimes (décision du 28/09/2026).
//
// Le site public, « Mon abonnement », l'accueil, la console et Stripe lisent
// tous ce fichier. La base porte les MÊMES chiffres (tables `tarif_formules`
// et `tarif_tranches`, migration 20260928090000) parce que ses propres gardes
// en ont besoin ; `tests/tarification-2026.test.ts` compare les deux, unité
// par unité, pour que l'un ne change jamais seul.
//
// DEUX PUBLICS, DEUX GRILLES, et la frontière est l'USAGE, pas la forme
// juridique : une SCI qui gère ses propres biens relève de la grille
// particuliers (organisation `proprietaire_direct`) ; une agence qui gère pour
// des tiers relève de la grille agences (organisation `agence`).
//
// CE QUI N'EXISTE PLUS. Le premier bien offert à vie (grille du 05/09) et le
// plafond de 600 lots au-delà duquel une agence passait par un devis. Aucune
// formule n'est gratuite en permanence : l'essai de 2 mois est la seule
// période sans paiement (porté de 14 jours à 2 mois le 30/09/2026).

/** Toute somme de ce module est un nombre ENTIER de centimes. */
export type Centimes = number;

export type Periodicite = "mensuel" | "annuel";
export const PERIODICITES: readonly Periodicite[] = ["mensuel", "annuel"];

export type CodeFormule = "solo" | "bailleur" | "investisseur" | "patrimoine";

export type Formule = {
  code: CodeFormule;
  nom: string;
  /** Nombre de biens inclus (plafond de la formule). */
  biens: number;
  /** Prix TTC par mois, paiement mensuel. */
  mensuelCents: Centimes;
  /** Prix TTC par an, prélevé en une fois (deux mois offerts). */
  annuelCents: Centimes;
};

// ── Particuliers et SCI gérant leurs propres biens — prix TTC ───────────────
export const FORMULES_PARTICULIER: readonly Formule[] = [
  { code: "solo", nom: "Solo", biens: 1, mensuelCents: 599, annuelCents: 5990 },
  { code: "bailleur", nom: "Bailleur", biens: 3, mensuelCents: 999, annuelCents: 9990 },
  { code: "investisseur", nom: "Investisseur", biens: 10, mensuelCents: 1999, annuelCents: 19990 },
  { code: "patrimoine", nom: "Patrimoine", biens: 20, mensuelCents: 2999, annuelCents: 29990 },
];

/** Au-delà de 20 biens : Patrimoine + ce prix TTC par bien supplémentaire. */
export const SUPPLEMENT_BIEN_CENTS: Record<Periodicite, Centimes> = {
  mensuel: 100,
  annuel: 1000,
};

// ── Agences — prix HT, mensuel uniquement ────────────────────────────────────
export type Tranche = {
  /** Premier lot de la tranche (inclus). */
  du: number;
  /** Dernier lot de la tranche (inclus) ; null = sans fin. */
  au: number | null;
  /** Prix HT par lot dans la tranche. */
  prixLotCents: Centimes;
  /** Forfait HT porté par la tranche (le socle, sur la première). */
  forfaitCents: Centimes;
};

export const TRANCHES_AGENCE: readonly Tranche[] = [
  { du: 1, au: 10, prixLotCents: 0, forfaitCents: 3900 },
  { du: 11, au: 50, prixLotCents: 200, forfaitCents: 0 },
  { du: 51, au: 200, prixLotCents: 150, forfaitCents: 0 },
  { du: 201, au: null, prixLotCents: 100, forfaitCents: 0 },
];

// L'ESSAI GRATUIT (décision du porteur du 30/09/2026) : 2 mois, pour tous —
// particuliers, SCI et agences. Il se compte en MOIS CALENDAIRES, comme en
// base (`current_date + interval '2 months'`, migration 20260930100000) : un
// nombre de jours fixe dirait faux un mois sur deux.
export const MOIS_ESSAI = 2;
/** La durée de l'essai telle qu'on l'écrit : « 2 mois ». */
export const DUREE_ESSAI = `${MOIS_ESSAI} mois`;

// ── Calculs ─────────────────────────────────────────────────────────────────

function entierPositif(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

export function prixFormule(f: Formule, periodicite: Periodicite): Centimes {
  return periodicite === "annuel" ? f.annuelCents : f.mensuelCents;
}

export function formuleParCode(code: string | null | undefined): Formule | null {
  return FORMULES_PARTICULIER.find((f) => f.code === code) ?? null;
}

const PATRIMOINE = FORMULES_PARTICULIER[FORMULES_PARTICULIER.length - 1];

export type OffreParticulier = {
  public: "particulier";
  periodicite: Periodicite;
  formule: Formule;
  /** Biens au-delà de 20, facturés en supplément (0 sinon). */
  biensSupplementaires: number;
  /** Nombre de biens couverts : plafond de la formule + suppléments. */
  capacite: number;
  /** Montant TTC d'une période (un mois ou un an). */
  montantCents: Centimes;
  lignes: LigneTarif[];
};

export type OffreAgence = {
  public: "agence";
  periodicite: "mensuel";
  /** Lots sous mandat actif facturés. */
  lots: number;
  capacite: number;
  /** Montant HT d'un mois. */
  montantCents: Centimes;
  lignes: LigneTarif[];
};

export type Offre = OffreParticulier | OffreAgence;

/** Une ligne de facture : ce que Stripe affichera, et ce que l'écran affiche. */
export type LigneTarif = {
  /** Identifiant stable du produit (sert aussi d'identifiant produit Stripe). */
  produit: string;
  libelle: string;
  quantite: number;
  prixUnitaireCents: Centimes;
  totalCents: Centimes;
};

/**
 * L'offre d'une formule donnée pour un nombre de biens. Au-delà de 20 biens,
 * seule Patrimoine accepte des biens supplémentaires ; une formule plus petite
 * que le portefeuille rend `null` (elle ne le couvre pas).
 */
export function offreFormule(
  formule: Formule,
  biens: number,
  periodicite: Periodicite
): OffreParticulier | null {
  const n = entierPositif(biens);
  const supplementaires =
    formule.code === PATRIMOINE.code ? Math.max(0, n - PATRIMOINE.biens) : 0;
  if (n > formule.biens + supplementaires) return null;
  const base = prixFormule(formule, periodicite);
  const unitaire = SUPPLEMENT_BIEN_CENTS[periodicite];
  const lignes: LigneTarif[] = [
    {
      produit: `gerimmo_formule_${formule.code}`,
      libelle: `Formule ${formule.nom} — ${formule.biens} bien${formule.biens > 1 ? "s" : ""} inclus`,
      quantite: 1,
      prixUnitaireCents: base,
      totalCents: base,
    },
  ];
  if (supplementaires > 0) {
    lignes.push({
      produit: "gerimmo_bien_supplementaire",
      libelle: "Bien supplémentaire au-delà de 20",
      quantite: supplementaires,
      prixUnitaireCents: unitaire,
      totalCents: supplementaires * unitaire,
    });
  }
  return {
    public: "particulier",
    periodicite,
    formule,
    biensSupplementaires: supplementaires,
    capacite: formule.biens + supplementaires,
    montantCents: lignes.reduce((s, l) => s + l.totalCents, 0),
    lignes,
  };
}

/**
 * La formule la MOINS CHÈRE qui couvre le portefeuille, pour la périodicité
 * choisie. Zéro bien : Solo (aucune formule n'est gratuite).
 */
export function offreParticulier(biens: number, periodicite: Periodicite): OffreParticulier {
  const offres = FORMULES_PARTICULIER.map((f) => offreFormule(f, biens, periodicite)).filter(
    (o): o is OffreParticulier => o !== null
  );
  // Patrimoine couvre toujours (suppléments) : la liste n'est jamais vide.
  return offres.reduce((moins, o) => (o.montantCents < moins.montantCents ? o : moins));
}

/** Les formules qui couvrent le portefeuille, de la moins chère à la plus chère. */
export function formulesCouvrant(biens: number, periodicite: Periodicite): OffreParticulier[] {
  return FORMULES_PARTICULIER.map((f) => offreFormule(f, biens, periodicite))
    .filter((o): o is OffreParticulier => o !== null)
    .sort((a, b) => a.montantCents - b.montantCents);
}

/**
 * Le montant HT mensuel d'une agence : barème MARGINAL, tranche par tranche.
 * Chaque lot est facturé au prix de SA tranche ; le socle de 39 € HT
 * s'applique dès la souscription, même sous dix lots (et même à zéro lot).
 */
export function offreAgence(lots: number): OffreAgence {
  const n = entierPositif(lots);
  const lignes: LigneTarif[] = [];
  TRANCHES_AGENCE.forEach((t, i) => {
    if (t.forfaitCents > 0) {
      lignes.push({
        produit: `gerimmo_agence_tranche_${i + 1}`,
        libelle: `Socle — jusqu'à ${t.au} lots inclus`,
        quantite: 1,
        prixUnitaireCents: t.forfaitCents,
        totalCents: t.forfaitCents,
      });
      return;
    }
    const haut = t.au ?? Number.POSITIVE_INFINITY;
    const dansTranche = Math.max(0, Math.min(n, haut) - (t.du - 1));
    if (dansTranche > 0) {
      lignes.push({
        produit: `gerimmo_agence_tranche_${i + 1}`,
        libelle:
          t.au === null
            ? `Lots à partir du ${t.du}ᵉ`
            : `Lots du ${t.du}ᵉ au ${t.au}ᵉ`,
        quantite: dansTranche,
        prixUnitaireCents: t.prixLotCents,
        totalCents: dansTranche * t.prixLotCents,
      });
    }
  });
  return {
    public: "agence",
    periodicite: "mensuel",
    lots: n,
    capacite: n,
    montantCents: lignes.reduce((s, l) => s + l.totalCents, 0),
    lignes,
  };
}

// ── Taxes ───────────────────────────────────────────────────────────────────

/**
 * Le régime de TVA de l'ÉDITEUR, tel qu'il le déclare (src/lib/editeur.ts).
 * `null` = non renseigné : aucun montant de taxe n'est alors inventé, et la
 * souscription en ligne reste fermée tant qu'il manque.
 */
export type RegimeTva =
  | { nature: "franchise" } // art. 293 B du CGI : TVA non applicable
  | { nature: "assujetti"; tauxPourcent: number };

export type Montants =
  | { connu: true; htCents: Centimes; tvaCents: Centimes; ttcCents: Centimes; mention: string }
  | { connu: false; htCents: Centimes | null; ttcCents: Centimes | null; mention: string };

export const MENTION_REGIME_INCONNU =
  "Régime de TVA de l'éditeur non encore renseigné : le montant des taxes sera affiché avant tout paiement.";

/**
 * Décomposer un prix. `base` dit ce que la grille fixe : le TTC pour les
 * particuliers (5,99 € est ce qu'ils paient), le HT pour les agences.
 */
export function montants(prixCents: Centimes, base: "ttc" | "ht", regime: RegimeTva | null): Montants {
  if (!regime) {
    return base === "ttc"
      ? { connu: false, htCents: null, ttcCents: prixCents, mention: MENTION_REGIME_INCONNU }
      : { connu: false, htCents: prixCents, ttcCents: null, mention: MENTION_REGIME_INCONNU };
  }
  if (regime.nature === "franchise") {
    return {
      connu: true,
      htCents: prixCents,
      tvaCents: 0,
      ttcCents: prixCents,
      mention: "TVA non applicable, art. 293 B du CGI.",
    };
  }
  const t = regime.tauxPourcent;
  if (base === "ttc") {
    const ht = Math.round((prixCents * 100) / (100 + t));
    return { connu: true, htCents: ht, tvaCents: prixCents - ht, ttcCents: prixCents, mention: `Dont TVA ${t} %.` };
  }
  const tva = Math.round((prixCents * t) / 100);
  return { connu: true, htCents: prixCents, tvaCents: tva, ttcCents: prixCents + tva, mention: `TVA ${t} % en sus.` };
}

/**
 * L'étiquette de taxe à accoler à un prix PUBLIÉ (vitrine, conditions) :
 * « TTC » ou « HT » pour un éditeur assujetti, ou tant que le régime n'est pas
 * renseigné (c'est alors ce que fixe la grille) ; RIEN en franchise en base —
 * « 39 € HT » laisserait croire qu'une TVA s'ajoute, alors qu'aucune n'est
 * facturée (art. 293 B du CGI). La mention de franchise s'affiche à côté
 * (`mentionTaxesPubliques`).
 */
export function etiquetteTaxes(base: "ttc" | "ht", regime: RegimeTva | null): "TTC" | "HT" | null {
  if (regime?.nature === "franchise") return null;
  return base === "ttc" ? "TTC" : "HT";
}

/**
 * La phrase de taxes des pages publiques, la même partout (tarifs, accueil).
 */
export function mentionTaxesPubliques(regime: RegimeTva | null): string {
  if (!regime) return MENTION_REGIME_INCONNU;
  if (regime.nature === "franchise") {
    return "TVA non applicable, art. 293 B du CGI : les prix affichés sont les montants payés, pour les particuliers comme pour les agences.";
  }
  return `Particuliers : prix TTC, TVA ${regime.tauxPourcent} % incluse. Agences : prix HT, TVA ${regime.tauxPourcent} % en sus, détaillée avant paiement.`;
}

export function montantsOffre(o: Offre, regime: RegimeTva | null): Montants {
  return montants(o.montantCents, o.public === "agence" ? "ht" : "ttc", regime);
}

// ── Changements ─────────────────────────────────────────────────────────────

export type SensChangement = "hausse" | "baisse" | "identique";

export function sensChangement(avantCents: Centimes, apresCents: Centimes): SensChangement {
  if (apresCents > avantCents) return "hausse";
  if (apresCents < avantCents) return "baisse";
  return "identique";
}

/**
 * ESTIMATION du prorata d'une hausse appliquée en cours de période : la
 * différence de prix, au temps restant. Le montant exact vient de Stripe
 * (aperçu de facture) quand il est joignable ; ceci n'en est que l'ordre de
 * grandeur, et l'écran le dit.
 */
export function estimationProrataCents(
  avantCents: Centimes,
  apresCents: Centimes,
  debutPeriodeMs: number,
  finPeriodeMs: number,
  maintenantMs: number
): Centimes {
  const total = finPeriodeMs - debutPeriodeMs;
  if (total <= 0 || apresCents <= avantCents) return 0;
  const restant = Math.min(total, Math.max(0, finPeriodeMs - maintenantMs));
  return Math.round(((apresCents - avantCents) * restant) / total);
}

/** L'économie annuelle par rapport à douze mensualités (« deux mois offerts »). */
export function economieAnnuelleCents(f: Formule): Centimes {
  return f.mensuelCents * 12 - f.annuelCents;
}

/** Libellé court de la périodicité, pour un montant : « / mois » ou « / an ». */
export function parPeriode(p: Periodicite): string {
  return p === "annuel" ? "/ an" : "/ mois";
}

/** Formater des centimes en euros français, sans passer par un flottant affiché faux. */
export function euros(cents: Centimes): string {
  const signe = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const entiers = Math.floor(abs / 100).toLocaleString("fr-FR");
  const dec = String(abs % 100).padStart(2, "0");
  return `${signe}${entiers},${dec} €`;
}
