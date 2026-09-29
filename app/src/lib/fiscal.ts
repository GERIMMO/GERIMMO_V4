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
//
// Audit gestion du 29/09 — CHARGES RÉCUPÉRABLES HORS 2044. Les provisions de
// charges remboursées par le locataire ne sont pas un revenu foncier, et les
// charges récupérables payées par le bailleur ne sont pas déductibles (BOI-
// RFPI-BASE-20-10 ; notice 2044). La part « provision de charges » d'un
// encaissement de loyer (reconstituée au prorata du bail — voir
// ventilerLoyer) sort donc des recettes, comme les régularisations et la taxe
// d'enlèvement des ordures ménagères (TEOM, récupérable) qui sort aussi de la
// ligne 227. Ligne 229 : seule la part NON récupérable des charges de
// copropriété se déduit, quand le décompte du syndic la distingue.

export type EcritureFiscale = {
  categorie: string;
  sens: string;
  montant: number | string;
  date_piece: string;
  // Une contre-écriture (sens inversé, RM-A6.4) se soustrait de la rubrique
  // de son origine — sans cela, l'annulation d'une dépense gonflerait les loyers.
  contre_ecriture_de?: string | null;
  // Lot rattaché : porte la quote-part (indivision) et le régime (meublé → BIC)
  lot_id?: string | null;
  // Bail rattaché : porte la clé de ventilation loyer/charges (lignes 211/212)
  bail_id?: string | null;
};

export type OptionsFiscales = {
  // Quote-part de détention du déclarant par lot, en % (absente = 100).
  // Indivision comme SCI : le récapitulatif se ventile, les tantièmes de
  // copropriété restent informatifs, jamais une clé de calcul.
  quoteParts?: Map<string, number>;
  // Lots meublés : leurs écritures relèvent des BIC, pas de la 2044 —
  // exclues du récapitulatif et totalisées à part (décision du 2026-09-04).
  lotsMeubles?: Set<string>;
  // Clé de ventilation loyer / charges par bail : loyer HC et provision de
  // charges du bail. L'écriture d'encaissement du livre porte le TOTAL
  // (catégorie « loyer », trigger ecrire_encaissement) : la part charges se
  // reconstitue au prorata du bail et sort des recettes (charges récupérées).
  ventilationLoyers?: Map<string, { loyerHc: number; charges: number }>;
  // Part RÉCUPÉRABLE des charges de copropriété de l'année, par lot (postes
  // « récupérable » des appels ventilés) : retirée de la ligne 229.
  chargesCoproRecuperables?: Map<string, number>;
};

export type RubriqueFiscale = {
  code: string;
  libelle: string;
  sens: "recette" | "depense";
  montant: number;
  // La part du déclarant (indivision) — égale au montant hors ventilation
  montantQuotePart: number;
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
  // Totaux à la quote-part du déclarant
  totalRecettesQuotePart: number;
  totalChargesQuotePart: number;
  revenuNetQuotePart: number;
  // Au moins un lot est détenu à moins de 100 % : la colonne quote-part compte
  ventile: boolean;
  // Écritures des lots meublés, tenues hors récapitulatif (BIC)
  meuble: { recettes: number; depenses: number; nbEcritures: number };
  nbEcritures: number;
  // Hors 2044 (audit 29/09) : provisions et régularisations de charges
  // remboursées par les locataires, TEOM payée, part récupérable des charges
  // de copropriété — ni revenus, ni charges déductibles.
  chargesRecuperees: number;
  teomExclue: number;
  coproRecuperableExclue: number;
};

type Regle = {
  code: string;
  libelle: string;
  sens: "recette" | "depense";
  mots: string[];
};

// Ordre = ordre des rubriques sur l'imprimé 2044
const REGLES: Regle[] = [
  { code: "211", libelle: "Loyers bruts encaissés (hors provisions de charges)", sens: "recette", mots: ["loyer", "recette", "indemnit"] },
  // Ligne 212 de la notice : dépenses du bailleur mises par convention à la
  // charge du locataire (ex. grosses réparations) — le livre ne les distingue
  // pas. Ce ne sont PAS les charges récupérables, qui sortent de la 2044.
  { code: "212", libelle: "Dépenses mises par convention à la charge des locataires", sens: "recette", mots: [] },
  { code: "221", libelle: "Frais d'administration et de gestion", sens: "depense", mots: ["honoraire", "gestion", "administration", "frais"] },
  { code: "222", libelle: "Autres frais de gestion (forfait)", sens: "depense", mots: [] },
  { code: "223", libelle: "Primes d'assurance (PNO, GLI…)", sens: "depense", mots: ["assurance", "pno", "gli"] },
  { code: "224", libelle: "Dépenses de réparation, d'entretien et d'amélioration", sens: "depense", mots: ["travaux", "reparation", "réparation", "entretien", "plomb", "electric", "électric", "chauff", "peinture", "amelioration", "amélioration", "intervention", "incident", "facture"] },
  { code: "227", libelle: "Taxe foncière et taxes annexes (hors TEOM)", sens: "depense", mots: ["taxe", "foncier", "fonciere", "foncière", "impot", "impôt"] },
  { code: "229", libelle: "Provisions pour charges de copropriété (part non récupérable)", sens: "depense", mots: ["copro", "syndic", "appel de charges"] },
  { code: "250", libelle: "Intérêts d'emprunt", sens: "depense", mots: [] },
];

// Hors 2044 (audit 29/09) : charges remboursées par le locataire (recettes)
// et taxe d'enlèvement des ordures ménagères, récupérable (dépense).
const MOTS_CHARGES_RECUPEREES = ["charge", "provision", "regularisation", "régularisation"];
const MOTS_TEOM = ["teom", "ordures", "enlevement des ordures"];

/** « hors » : l'écriture ne relève pas de la 2044 (charges récupérables, TEOM). */
export const HORS_2044 = "hors";

const MOTS_ALUR = ["fonds travaux", "fonds de travaux", "fonds alur", "alur"];

function normaliser(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// La rubrique d'une écriture : premier mot-clé rencontré dans l'ordre des
// règles, dans le sens de l'écriture ; sinon la rubrique « autres » du sens.
export function rubriqueDe(categorie: string, sens: string): string {
  const c = normaliser(categorie);
  if (MOTS_TEOM.some((m) => c.includes(normaliser(m)))) return HORS_2044;
  if (sens === "recette" && MOTS_CHARGES_RECUPEREES.some((m) => c.includes(normaliser(m)))) return HORS_2044;
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

// Ventilation d'un encaissement de loyer entre part loyer (211) et part
// charges (212), au prorata du bail : charges / (loyer HC + charges) au
// moment de l'appel. Règle retenue (anomalie P1 de l'audit du 09/09) : le
// livre n'enregistre qu'une écriture « loyer » au montant total ; la 2044
// distingue pourtant loyers bruts (211) et charges récupérées (212), comme
// le bail et les reçus. La part 212 est arrondie au centime, le reliquat va
// en 211 : 211 + 212 se réconcilie exactement avec l'encaissé, y compris
// pour les paiements partiels (imputés au prorata, faute de mieux).
export function ventilerLoyer(
  montant: number,
  loyerHc: number,
  charges: number
): { part211: number; part212: number } {
  const total = loyerHc + charges;
  if (!(charges > 0) || !(total > 0)) return { part211: montant, part212: 0 };
  // Arrondi symétrique (valeur absolue) : une contre-écriture (montant
  // négatif) se ventile exactement comme son origine et s'annule au centime.
  const brut = (montant * charges) / total;
  const part212 = (Math.sign(brut) * Math.round(Math.abs(brut) * 100)) / 100;
  return { part211: montant - part212, part212 };
}

export function recapitulatifFiscal(
  ecritures: EcritureFiscale[],
  annee: number,
  options: OptionsFiscales = {}
): RecapitulatifFiscal {
  const montants = new Map<string, number>();
  const montantsQuotePart = new Map<string, number>();
  const categories = new Map<string, Set<string>>();
  let fondsTravauxAlur = 0;
  let nbEcritures = 0;
  let chargesRecuperees = 0;
  let teomExclue = 0;
  const meuble = { recettes: 0, depenses: 0, nbEcritures: 0 };
  // Ligne 229 par lot : la part récupérable s'en retire en fin de calcul
  const copro229ParLot = new Map<string, number>();

  const quotePartDe = (lot: string | null | undefined) => {
    if (!lot) return 100;
    return options.quoteParts?.get(lot) ?? 100;
  };

  for (const e of ecritures) {
    if (!e.date_piece?.startsWith(String(annee))) continue;
    if (e.sens !== "recette" && e.sens !== "depense") continue;
    // Le dépôt de garantie n'est pas un revenu : il transite (encaissement
    // comme restitution) — ses mouvements sortent du récapitulatif 2044.
    if (e.categorie === "depot_garantie") continue;
    const annulation = Boolean(e.contre_ecriture_de);
    const sensOrigine = annulation ? (e.sens === "recette" ? "depense" : "recette") : e.sens;
    const montant = (Number(e.montant) || 0) * (annulation ? -1 : 1);
    // Lot meublé : BIC, pas revenus fonciers — totalisé à part, jamais dans
    // les rubriques de la 2044.
    if (e.lot_id && options.lotsMeubles?.has(e.lot_id)) {
      meuble.nbEcritures++;
      if (sensOrigine === "recette") meuble.recettes += montant;
      else meuble.depenses += montant;
      continue;
    }
    nbEcritures++;
    if (sensOrigine === "depense" && estFondsTravauxAlur(e.categorie)) {
      fondsTravauxAlur += montant;
      continue;
    }
    const code = rubriqueDe(e.categorie, sensOrigine);
    if (code === HORS_2044) {
      if (sensOrigine === "recette") chargesRecuperees += montant;
      else teomExclue += montant;
      continue;
    }
    // Encaissement de loyer (écriture au montant total, provision comprise) :
    // la part provision de charges, reconstituée au prorata du bail, sort des
    // recettes (audit 29/09) — les contre-écritures (montant négatif) se
    // ventilent avec la même clé et s'annulent donc bien.
    const parts: [string, number][] = [[code, montant]];
    const cle = e.bail_id ? options.ventilationLoyers?.get(e.bail_id) : undefined;
    if (code === "211" && cle && normaliser(e.categorie).includes("loyer")) {
      const { part211, part212 } = ventilerLoyer(montant, cle.loyerHc, cle.charges);
      if (part212 !== 0) {
        parts[0] = ["211", part211];
        chargesRecuperees += part212;
      }
    }
    if (code === "229" && e.lot_id) {
      copro229ParLot.set(e.lot_id, (copro229ParLot.get(e.lot_id) ?? 0) + montant);
    }
    for (const [c, m] of parts) {
      montants.set(c, (montants.get(c) ?? 0) + m);
      montantsQuotePart.set(
        c,
        (montantsQuotePart.get(c) ?? 0) + (m * quotePartDe(e.lot_id)) / 100
      );
      if (!categories.has(c)) categories.set(c, new Set());
      categories.get(c)!.add(e.categorie);
    }
  }

  // Ligne 229 : la part récupérable des charges de copropriété (décompte du
  // syndic ventilé) se retire, lot par lot, sans rendre la ligne négative.
  let coproRecuperableExclue = 0;
  for (const [lot, recuperable] of options.chargesCoproRecuperables ?? []) {
    const retrait = Math.min(Math.max(recuperable, 0), Math.max(copro229ParLot.get(lot) ?? 0, 0));
    if (retrait <= 0) continue;
    coproRecuperableExclue += retrait;
    montants.set("229", (montants.get("229") ?? 0) - retrait);
    montantsQuotePart.set("229", (montantsQuotePart.get("229") ?? 0) - (retrait * quotePartDe(lot)) / 100);
  }

  const rubriques: RubriqueFiscale[] = REGLES.map((r) => ({
    code: r.code,
    libelle: r.libelle,
    sens: r.sens,
    montant: arrondir(montants.get(r.code) ?? 0),
    montantQuotePart: arrondir(montantsQuotePart.get(r.code) ?? 0),
    aCompleter: r.code === "250" && !montants.has("250"),
    categories: [...(categories.get(r.code) ?? [])],
  }));
  if (montants.has("autres")) {
    rubriques.push({
      code: "—",
      libelle: "Autres dépenses non rangées (à qualifier)",
      sens: "depense",
      montant: arrondir(montants.get("autres")!),
      montantQuotePart: arrondir(montantsQuotePart.get("autres") ?? 0),
      categories: [...(categories.get("autres") ?? [])],
    });
  }

  const totalRecettes = arrondir(
    rubriques.filter((r) => r.sens === "recette").reduce((s, r) => s + r.montant, 0)
  );
  const totalCharges = arrondir(
    rubriques.filter((r) => r.sens === "depense").reduce((s, r) => s + r.montant, 0)
  );
  const totalRecettesQuotePart = arrondir(
    rubriques.filter((r) => r.sens === "recette").reduce((s, r) => s + r.montantQuotePart, 0)
  );
  const totalChargesQuotePart = arrondir(
    rubriques.filter((r) => r.sens === "depense").reduce((s, r) => s + r.montantQuotePart, 0)
  );
  const ventile = [...(options.quoteParts?.values() ?? [])].some((q) => q < 100);
  return {
    annee,
    rubriques,
    fondsTravauxAlur: arrondir(fondsTravauxAlur),
    totalRecettes,
    totalCharges,
    revenuNet: arrondir(totalRecettes - totalCharges),
    totalRecettesQuotePart,
    totalChargesQuotePart,
    revenuNetQuotePart: arrondir(totalRecettesQuotePart - totalChargesQuotePart),
    ventile,
    meuble: {
      recettes: arrondir(meuble.recettes),
      depenses: arrondir(meuble.depenses),
      nbEcritures: meuble.nbEcritures,
    },
    nbEcritures,
    chargesRecuperees: arrondir(chargesRecuperees),
    teomExclue: arrondir(teomExclue),
    coproRecuperableExclue: arrondir(coproRecuperableExclue),
  };
}

function arrondir(n: number): number {
  return Math.round(n * 100) / 100;
}
