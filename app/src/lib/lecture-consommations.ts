import { lireToutesLesPages, type PageLue } from "./lecture-complete";

/** Une collection incomplète ne doit jamais devenir un total ni une liste d'actions fiable. */
export async function lireCollectionConsommations<T extends { id: string }>(
  page: (debut: number, fin: number) => PromiseLike<PageLue<T>>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const r = await lireToutesLesPages(page, ligne => ligne.id);
  return r.echec ? { data: [], error: { message: "Le suivi a changé ou n’a pas pu être chargé entièrement. Rechargez la page." } } : { data: r.lignes, error: null };
}

/** Les listes d'UUID sont découpées pour rester sous la taille des URL de l'API. */
export async function lireLiensConsommations<T extends { id: string }>(
  ids: string[], page: (ids: string[], debut: number, fin: number) => PromiseLike<PageLue<T>>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const lignes = new Map<string, T>();
  const uniques = [...new Set(ids)];
  for (let i = 0; i < uniques.length; i += 100) {
    const lot = uniques.slice(i, i + 100);
    const r = await lireCollectionConsommations((debut, fin) => page(lot, debut, fin));
    if (r.error) return { data: [], error: r.error };
    for (const ligne of r.data) lignes.set(ligne.id, ligne);
  }
  return { data: [...lignes.values()], error: null };
}
