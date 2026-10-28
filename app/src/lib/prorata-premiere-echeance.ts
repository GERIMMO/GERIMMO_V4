// Le montant de la première échéance d'un bail qui n'entre pas un 1er du mois : la MÊME règle que la base
// (`generer_appels_loyer_interne`, migration 20260803_prorata_au_centime puis 20261014120000) — loyer et charges
// proratisés SÉPARÉMENT, un seul arrondi au centime à la fin sur chaque composante, total = somme des deux.
//
// Audit final du 27/10 (COD-01) : le bail nu et le bail meublé recalculaient chacun ce prorata sur le TOTAL, en
// flottants et dans deux ordres d'opérations différents ; sur 30 millions de couples (montant × mois × jour d'entrée),
// 148 833 donnaient un centime différent entre les deux contrats, et le contrat pouvait différer d'un centime du
// premier avis d'échéance (650,01 + 100,01 € pour 15 jours sur 30 : contrat 375,01 €, appel 375,02 €). Le contrat est
// produit au brouillon, avant toute génération d'appel : il ne peut pas relire l'appel, il doit calculer pareil.
//
// Le calcul se fait en centimes ENTIERS : Math.round(lc × j / n) pour un entier positif vaut round(…, 2) de PostgreSQL
// (arrondi commercial, la demie vers le haut) ; la virgule flottante n'intervient plus.
// Règle métier : wiki « Prorata du premier et du dernier terme ».

export type ProrataPremiereEcheance = {
  /** Jours facturés (du jour d'entrée au dernier jour du mois, inclus). */
  joursDus: number;
  /** Jours du mois d'entrée. */
  joursDuMois: number;
  loyerHc: number;
  charges: number;
  /** loyerHc + charges — la somme des composantes arrondies, jamais l'arrondi du total. */
  total: number;
  /** Faux quand le bail entre un 1er : le terme est plein. */
  prorata: boolean;
};

/** Centimes entiers d'un montant lu en base (chaîne ou nombre). */
function centimes(v: number | string): number {
  return Math.round(Number(v) * 100);
}

/**
 * Prorata de la première échéance pour une date de début « AAAA-MM-JJ » (le reste de la chaîne est ignoré).
 * Un montant absent compte zéro : le modèle de contrat décide, avant d'appeler, s'il peut imprimer le montant.
 */
export function prorataPremiereEcheance(
  loyerHc: number | string | null | undefined,
  charges: number | string | null | undefined,
  dateDebutIso: string
): ProrataPremiereEcheance {
  const [annee, mois, jour] = dateDebutIso.slice(0, 10).split("-").map(Number);
  // Jour 0 du mois suivant = dernier jour du mois d'entrée (UTC : une date sans heure).
  const joursDuMois = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  const joursDus = joursDuMois - jour + 1;
  const lc = centimes(loyerHc ?? 0);
  const cc = centimes(charges ?? 0);
  const plein = joursDus === joursDuMois;
  const loyerCentimes = plein ? lc : Math.round((lc * joursDus) / joursDuMois);
  const chargesCentimes = plein ? cc : Math.round((cc * joursDus) / joursDuMois);
  return {
    joursDus,
    joursDuMois,
    loyerHc: loyerCentimes / 100,
    charges: chargesCentimes / 100,
    total: (loyerCentimes + chargesCentimes) / 100,
    prorata: !plein,
  };
}
