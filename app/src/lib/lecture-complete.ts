// Lire une table EN ENTIER, page par page, et pouvoir le prouver.
//
// Audit du 23/10/2026, A04 (P1). L'API de lecture rend au plus 1 000 lignes par requête (réglage « Max rows » de
// Supabase) et ne dit RIEN quand elle coupe (voir `lectures-fiscales.ts`). L'export du journal de gestion lisait ses
// écritures d'une seule requête : à 1 001 écritures, il rendait 1 000 lignes, un statut de succès et un fichier nommé
// « complet ». Trois règles, ici une fois pour toutes :
//
//   1. un ordre STABLE, la clé unique en dernier critère : sans elle, deux lignes de même date peuvent changer de place
//      d'une page à l'autre, et l'une être lue deux fois pendant que l'autre ne l'est jamais ;
//   2. chaque page demande `count: "exact"`, et la lecture avance du nombre de lignes REÇUES (pas du nombre demandé) :
//      un plafond réglé plus bas que 1 000 ne fait donc rien perdre ;
//   3. on ne rend les lignes que si leur nombre égale le compte annoncé, que ce compte n'a pas bougé d'une page à
//      l'autre, et qu'aucune clé n'a été lue deux fois. Sinon : un échec qui dit pourquoi, jamais une liste partielle.

import { LIMITE_LIGNES_API } from "./lectures-fiscales";

/** Ce que rend une page : la forme d'une réponse du client Supabase lue avec `count: "exact"`. */
export type PageLue<T> = { data: T[] | null; error: { message: string } | null; count: number | null };

export type EchecLecture =
  /** L'API a répondu par une erreur. */
  | { motif: "erreur"; message: string }
  /** L'API n'a pas donné de compte : rien ne permet de dire que la lecture est complète. */
  | { motif: "sans-compte" }
  /** Les données ont bougé pendant la lecture (compte changé entre deux pages, ou ligne relue). */
  | { motif: "modifiee" }
  /** Le nombre de lignes lues n'est pas le nombre annoncé. */
  | { motif: "incomplete"; lues: number; attendues: number };

export type LectureComplete<T> = { lignes: T[]; echec: null } | { lignes: null; echec: EchecLecture };

/**
 * `page(debut, fin)` fait UNE requête : la même à chaque appel (mêmes filtres, ordre stable terminé par la clé unique,
 * `count: "exact"`), bornée par `.range(debut, fin)`. `cle(ligne)` rend cette clé unique.
 */
export async function lireToutesLesPages<T>(
  page: (debut: number, fin: number) => PromiseLike<PageLue<T>>,
  cle: (ligne: T) => string,
  taille: number = LIMITE_LIGNES_API,
): Promise<LectureComplete<T>> {
  const lignes: T[] = [];
  const vues = new Set<string>();
  let attendues: number | null = null;
  for (;;) {
    const r = await page(lignes.length, lignes.length + taille - 1);
    if (r.error) return { lignes: null, echec: { motif: "erreur", message: r.error.message } };
    if (r.count == null) return { lignes: null, echec: { motif: "sans-compte" } };
    if (attendues === null) attendues = r.count;
    else if (r.count !== attendues) return { lignes: null, echec: { motif: "modifiee" } };
    const recues = r.data ?? [];
    for (const l of recues) {
      const k = cle(l);
      if (vues.has(k)) return { lignes: null, echec: { motif: "modifiee" } };
      vues.add(k);
      lignes.push(l);
    }
    // Fin : tout est là, ou l'API ne rend plus rien (le contrôle ci-dessous dit alors ce qui manque).
    if (recues.length === 0 || lignes.length >= attendues) break;
  }
  if (lignes.length !== attendues) {
    return { lignes: null, echec: { motif: "incomplete", lues: lignes.length, attendues } };
  }
  return { lignes, echec: null };
}
