export function numeroPage(valeur: unknown): number {
  return typeof valeur === "string" && /^\d+$/.test(valeur) ? Math.max(1, Math.min(1_000_000, Number(valeur))) : 1;
}

/** Le total est celui du filtre en base, jamais celui des lignes de la page. */
export async function lirePage<T, E>(
  demander: (debut: number, fin: number) => PromiseLike<{ data: T[] | null; count: number | null; error: E | null }>,
  page: number,
  taille = 25,
) {
  let lecture = await demander((page - 1) * taille, page * taille - 1);
  // PostgREST peut refuser un offset devenu hors limites au lieu de renvoyer [].
  if (page > 1 && typeof lecture.error === "object" && lecture.error !== null && "code" in lecture.error && lecture.error.code === "PGRST103") {
    page = 1;
    lecture = await demander(0, taille - 1);
  }
  if (!lecture.error && lecture.count !== null) {
    const derniere = Math.max(1, Math.ceil(lecture.count / taille));
    if (page > derniere) {
      page = derniere;
      lecture = await demander((page - 1) * taille, page * taille - 1);
    }
  }
  return { ...lecture, page, taille };
}

/** Valeur PostgREST citée, avec caractères de motif SQL traités littéralement. */
export function rechercheIlike(valeur: string): string {
  const motif = valeur.trim().slice(0, 160).replace(/[\\%_]/g, "\\$&");
  return `"%${motif.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}%"`;
}
