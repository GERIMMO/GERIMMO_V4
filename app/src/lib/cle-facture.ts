export type CleFacture = { date_effet: string; cle_repartition_lignes: { lot_id: string; pourcentage: string | number }[] };

export function partsEgalesEnregistrees(cles: CleFacture[], lots: { id: string }[], debut: string, fin: string) {
  if (lots.length < 2 || cles.some(c => c.date_effet > debut && c.date_effet <= fin)) return false;
  const applicable = cles.filter(c => c.date_effet <= debut).sort((a,b) => b.date_effet.localeCompare(a.date_effet))[0];
  const lignes = applicable?.cle_repartition_lignes ?? [];
  if (lignes.length !== lots.length) return false;
  const poids = lots.map(l => Math.round(Number(lignes.find(v => v.lot_id === l.id)?.pourcentage) * 100));
  return poids.every(v => v === poids[0] && v > 0) && poids.reduce((a,b) => a + b, 0) === 10000;
}
