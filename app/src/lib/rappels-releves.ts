/** Un seul rappel par palier, à compter de la demande (pas de la facture historique). */
export function palierRappelReleve(createdAt: string, maintenant: Date): number | null {
  const jours = Math.floor((maintenant.getTime() - Date.parse(createdAt)) / 86400000);
  return jours >= 14 ? 14 : jours >= 7 ? 7 : jours >= 3 ? 3 : null;
}
