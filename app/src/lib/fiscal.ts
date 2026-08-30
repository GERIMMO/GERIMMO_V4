// Récapitulatif fiscal du propriétaire direct (S9a — parcours 6.4, décision
// du 2026-07-25 : déclaration 2044, location nue, en V1 ; meublé/SCI en V2).
//
// Une aide à la déclaration, pas une déclaration : les écritures du livre sont
// regroupées par rubrique de la 2044, agrégées sur la DATE DE PIÈCE (le
// rapport mensuel, lui, suit la date d'imputation — RM-4.1.2). Les intérêts
// d'emprunt ne sont pas suivis (rubrique vide, à compléter) ; le fonds travaux
// ALUR est signalé à part (déductible l'année des travaux, pas du versement).
// Les catégories du livre sont libres : le rangement se fait par mots-clés,
// le reste tombe dans « autres » pour que rien ne disparaisse.

export type EcritureFiscale = {
  categorie: string;
  sens: string;
  montant: number | string;
  date_piece: string;
  // Une contre-écriture (sens inversé, RM-A6.4) se soustrait de la rubrique
  // de son origine — sans cela, l'annulation d'une dépense gonflerait les loyers.
  contre_ecriture_de?: string | null;
};

export type RubriqueFiscale = {
  code: string;
  libelle: string;
  sens: "recette" | "depense";
  montant: number;
  // Rubrique non alimentée par le livre : à compléter par le propriétaire
  aCompleter?: boolean;
  categories: string[];
};

export type RecapitulatifFiscal = {
  annee: number;
  rubriques: RubriqueFiscale[];
  fondsTravauxAlur: number;
  totalRecettes: number;
  totalCharges: number;
  revenuNet: number;
  nbEcritures: number;
};

type Regle = {
  code: string;
  libelle: string;
  sens: "recette" | "depense";
  mots: string[];
};

// Ordre = ordre des rubriques sur l'imprimé 2044
const REGLES: Regle[] = [
  { code: "211", libelle: "Loyers bruts encaissés", sens: "recette", mots: ["loyer", "recette", "indemnit"] },
  { code: "212", libelle: "Charges récupérées auprès des locataires", sens: "recette", mots: ["charge", "provision", "regularisation", "régularisation"] },
  { code: "221", libelle: "Frais d'administration et de gestion", sens: "depense", mots: ["honoraire", "gestion", "administration", "frais"] },
  { code: "222", libelle: "Autres frais de gestion (forfait)", sens: "depense", mots: [] },
  { code: "223", libelle: "Primes d'assurance (PNO, GLI…)", sens: "depense", mots: ["assurance", "pno", "gli"] },
  { code: "224", libelle: "Dépenses de réparation, d'entretien et d'amélioration", sens: "depense", mots: ["travaux", "reparation", "réparation", "entretien", "plomb", "electric", "électric", "chauff", "peinture", "amelioration", "amélioration", "intervention", "incident", "facture"] },
  { code: "227", libelle: "Taxe foncière et taxes annexes", sens: "depense", mots: ["taxe", "foncier", "fonciere", "foncière", "impot", "impôt", "teom"] },
  { code: "229", libelle: "Charges de copropriété non récupérables", sens: "depense", mots: ["copro", "syndic", "appel de charges"] },
  { code: "250", libelle: "Intérêts d'emprunt", sens: "depense", mots: [] },
];

const MOTS_ALUR = ["fonds travaux", "fonds de travaux", "fonds alur", "alur"];

function normaliser(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// La rubrique d'une écriture : premier mot-clé rencontré dans l'ordre des
// règles, dans le sens de l'écriture ; sinon la rubrique « autres » du sens.
export function rubriqueDe(categorie: string, sens: string): string {
  const c = normaliser(categorie);
  for (const r of REGLES) {
    if (r.sens !== sens) continue;
    if (r.mots.some((m) => c.includes(normaliser(m)))) return r.code;
  }
  return sens === "recette" ? "211" : "autres";
}

export function estFondsTravauxAlur(categorie: string): boolean {
  const c = normaliser(categorie);
  return MOTS_ALUR.some((m) => c.includes(normaliser(m)));
}

export function recapitulatifFiscal(
  ecritures: EcritureFiscale[],
  annee: number
): RecapitulatifFiscal {
  const montants = new Map<string, number>();
  const categories = new Map<string, Set<string>>();
  let fondsTravauxAlur = 0;
  let nbEcritures = 0;

  for (const e of ecritures) {
    if (!e.date_piece?.startsWith(String(annee))) continue;
    if (e.sens !== "recette" && e.sens !== "depense") continue;
    nbEcritures++;
    const annulation = Boolean(e.contre_ecriture_de);
    const sensOrigine = annulation ? (e.sens === "recette" ? "depense" : "recette") : e.sens;
    const montant = (Number(e.montant) || 0) * (annulation ? -1 : 1);
    if (sensOrigine === "depense" && estFondsTravauxAlur(e.categorie)) {
      fondsTravauxAlur += montant;
      continue;
    }
    const code = rubriqueDe(e.categorie, sensOrigine);
    montants.set(code, (montants.get(code) ?? 0) + montant);
    if (!categories.has(code)) categories.set(code, new Set());
    categories.get(code)!.add(e.categorie);
  }

  const rubriques: RubriqueFiscale[] = REGLES.map((r) => ({
    code: r.code,
    libelle: r.libelle,
    sens: r.sens,
    montant: arrondir(montants.get(r.code) ?? 0),
    aCompleter: r.code === "250" && !montants.has("250"),
    categories: [...(categories.get(r.code) ?? [])],
  }));
  if (montants.has("autres")) {
    rubriques.push({
      code: "—",
      libelle: "Autres dépenses non rangées (à qualifier)",
      sens: "depense",
      montant: arrondir(montants.get("autres")!),
      categories: [...(categories.get("autres") ?? [])],
    });
  }

  const totalRecettes = arrondir(
    rubriques.filter((r) => r.sens === "recette").reduce((s, r) => s + r.montant, 0)
  );
  const totalCharges = arrondir(
    rubriques.filter((r) => r.sens === "depense").reduce((s, r) => s + r.montant, 0)
  );
  return {
    annee,
    rubriques,
    fondsTravauxAlur: arrondir(fondsTravauxAlur),
    totalRecettes,
    totalCharges,
    revenuNet: arrondir(totalRecettes - totalCharges),
    nbEcritures,
  };
}

function arrondir(n: number): number {
  return Math.round(n * 100) / 100;
}
