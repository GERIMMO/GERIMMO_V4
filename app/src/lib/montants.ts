// L'AFFICHAGE DES MONTANTS EN EUROS, EN UN SEUL ENDROIT (audit final du 27/10, COD-05).
//
// Cinq fonctions exportées (`eur` deux fois, `formaterEuros`, `euros` deux fois) et plusieurs formateurs en ligne
// coexistaient, sur deux unités : des euros décimaux et des centimes entiers, parfois sous le même nom. Passer des centimes
// à une fonction qui attend des euros multiplie le montant par cent sans que rien ne le signale. Ici, deux noms qui disent
// l'unité : `formaterEuros(euros)` et `formaterCentimes(centimes)`, sur un seul formateur.
//
// Forme : « 1 234,50 € » — séparateur de milliers U+202F (espace fine insécable) et U+00A0 avant « € », comme
// Intl.NumberFormat fr-FR : au téléphone, « € » ne part jamais seul à la ligne.

const EUROS = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

/** « 1 234,50 € » à partir d'un montant en euros. Un montant qui s'arrondit à zéro s'écrit « 0,00 € », jamais « -0,00 € ». */
export function formaterEuros(euros: number): string {
  return EUROS.format(Math.abs(euros) < 0.005 ? 0 : euros);
}

/** « 1 234,50 € » à partir d'un nombre entier de centimes. */
export function formaterCentimes(centimes: number): string {
  return formaterEuros(centimes / 100);
}
