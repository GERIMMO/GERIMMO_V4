/**
 * Une jointure « vers-un » de PostgREST arrive tantôt en objet, tantôt en
 * tableau d'un élément, selon la façon dont la relation est déclarée. Écrire
 * `donnee.mandat?.[0]` marche dans un cas et rend silencieusement `undefined`
 * dans l'autre — la colonne se vide sans erreur, ce qui est le pire des deux.
 *
 * `premier()` accepte les deux formes.
 */
export type UnOuPlusieurs<T> = T | T[] | null;

export function premier<T>(v: T | T[] | null | undefined): T | undefined {
  if (v == null) return undefined;
  return Array.isArray(v) ? v[0] : v;
}
