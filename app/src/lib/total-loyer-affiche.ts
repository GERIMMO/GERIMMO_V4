/** Un total n'est présentable que lorsque ses deux composantes sont connues. */
export function totalLoyerAffiche(
  loyer: number | string | null | undefined,
  charges: number | string | null | undefined,
): number | null {
  const lire = (valeur: typeof loyer) => {
    if (valeur == null || (typeof valeur === "string" && !valeur.trim())) return null;
    const montant = Number(valeur);
    return Number.isFinite(montant) ? Math.round(montant * 100) : null;
  };
  const loyerCentimes = lire(loyer);
  const chargesCentimes = lire(charges);
  return loyerCentimes === null || chargesCentimes === null
    ? null
    : (loyerCentimes + chargesCentimes) / 100;
}
