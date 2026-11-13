// La contrainte de somme des quotes-parts inclut les deux bornes de la détention.
export function situerDetention(
  detention: { date_debut: string; date_fin: string | null },
  jour: string,
): "future" | "actuelle" | "terminee" {
  if (detention.date_debut > jour) return "future";
  if (detention.date_fin && detention.date_fin < jour) return "terminee";
  return "actuelle";
}
