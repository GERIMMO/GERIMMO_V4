/** Remplace les anciens manquants de la génération par le contrôle enregistré courant. */
export function actualiserControleGeneration<T extends { manquants?: string[]; erreur?: string }>(
  resultat: T | null,
  controle: { manquants: string[]; erreur?: string } | null,
): T | null {
  if (!controle || !resultat?.manquants?.length) return resultat;
  return { ...resultat, manquants: controle.manquants, erreur: controle.erreur ?? (controle.manquants.length ? "Complétez les informations indiquées, puis relancez la génération." : undefined) };
}
