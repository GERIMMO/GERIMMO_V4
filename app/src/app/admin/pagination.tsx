import Link from "next/link";

export function Pagination({ page, taille = 25, total, adresse, libelle }: {
  page: number; taille?: number; total: number; adresse: (page: number) => string; libelle: string;
}) {
  if (total <= taille && page <= 1) return null;
  return <nav aria-label={`Pages — ${libelle}`} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--filet)] pt-4 text-sm">
    {page > 1 ? <Link className="btn-secondaire" href={adresse(page - 1)} scroll={false}>← Précédente</Link> : <span />}
    <span>Page {page} sur {Math.max(1, Math.ceil(total / taille))} · {total} résultats</span>
    {page * taille < total ? <Link className="btn-secondaire" href={adresse(page + 1)} scroll={false}>Suivante →</Link> : <span />}
  </nav>;
}
