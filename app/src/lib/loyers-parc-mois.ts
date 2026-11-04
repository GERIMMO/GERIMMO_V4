/** Les règlements couvrant les échéances du mois, comme sur la page Finances. */
export function resumerLoyersParcMois(lignes: { montant_du: number | string; montant_couvert: number | string }[]) {
  let attendu = 0;
  let encaisse = 0;
  for (const ligne of lignes) {
    const du = typeof ligne.montant_du === 'string' && !ligne.montant_du.trim() ? NaN : Number(ligne.montant_du);
    const couvert = typeof ligne.montant_couvert === 'string' && !ligne.montant_couvert.trim() ? NaN : Number(ligne.montant_couvert);
    if (![du, couvert].every(n => Number.isFinite(n) && n >= 0)) return null;
    const terme = Math.round(du * 100);
    attendu += terme;
    encaisse += Math.min(terme, Math.round(couvert * 100));
    if (!Number.isSafeInteger(attendu) || !Number.isSafeInteger(encaisse)) return null;
  }
  return { attendu: attendu / 100, encaisse: encaisse / 100 };
}
