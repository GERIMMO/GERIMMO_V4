export type CleFacture = { date_effet: string; invalidated_at?: string | null; cle_repartition_lignes: { lot_id: string; pourcentage: string | number }[] };

/** Entre deux clés de même date, celle remplacée en dernier a été applicable en dernier. */
export function cleApplicableAuDebut(cles: CleFacture[], debut: string) {
  const eligibles = cles.filter(c => c.date_effet <= debut);
  const date = eligibles.reduce((max, c) => c.date_effet > max ? c.date_effet : max, "");
  const dernieres = eligibles.filter(c => c.date_effet === date);
  if (dernieres.length <= 1) return dernieres[0];
  const actives = dernieres.filter(c => c.invalidated_at === null);
  if (actives.length) return actives.length === 1 ? actives[0] : undefined;
  // PostgREST renvoie les timestamps UTC avec leur précision PostgreSQL.
  if (dernieres.some(c => !c.invalidated_at)) return undefined;
  const fin = dernieres.reduce((max, c) => c.invalidated_at! > max ? c.invalidated_at! : max, "");
  const finales = dernieres.filter(c => c.invalidated_at === fin);
  return finales.length === 1 ? finales[0] : undefined;
}

export function partsEgalesEnregistrees(cles: CleFacture[], lots: { id: string }[], debut: string, fin: string) {
  if (lots.length < 2 || cles.some(c => c.date_effet > debut && c.date_effet <= fin)) return false;
  const applicable = cleApplicableAuDebut(cles, debut);
  const lignes = applicable?.cle_repartition_lignes ?? [];
  if (lignes.length !== lots.length) return false;
  const poids = lots.map(l => Math.round(Number(lignes.find(v => v.lot_id === l.id)?.pourcentage) * 100));
  return poids.every(v => v === poids[0] && v > 0) && poids.reduce((a,b) => a + b, 0) === 10000;
}
