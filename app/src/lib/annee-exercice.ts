/** Une année saisie : quatre chiffres, sans notation scientifique ni valeur implicite. */
export function lireAnneeExercice(brut: unknown): number | null {
  if (typeof brut !== "string" || !/^\d{4}$/.test(brut.trim())) return null;
  const annee = Number(brut.trim());
  return annee >= 1970 && annee <= 2200 ? annee : null;
}
