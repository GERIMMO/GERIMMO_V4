import { numeroTrimestreIrl } from "@/lib/baux";

/** Trimestre IRL de référence d'un bail, écrit « T3 2026 » en base (la forme que lit `trimestre_irl_numero` /
 * `trimestre_irl_annee` et qu'écrit déjà la révision annuelle). La référence d'un indice INSEE est un trimestre
 * D'UNE ANNÉE : « T3 » seul est une mention incomplète dans un acte (audit final, BAIL-02). */
export const FORMAT_TRIMESTRE_IRL = /^T[1-4] (19|20)\d{2}$/;

const ORDINAUX = ["", "1er", "2e", "3e", "4e"];

/** Numéro et année lus dans un libellé libre (« T3 2026 », « 2e trimestre 2025 »…) ; l'année manque pour « T3 ». */
export function lireTrimestreIrl(libelle: string | null | undefined): { numero: number; annee: number | null } | null {
  const numero = numeroTrimestreIrl(libelle);
  if (!numero) return null;
  const annee = /((?:19|20)\d{2})/.exec(libelle ?? "")?.[1];
  return { numero, annee: annee ? Number(annee) : null };
}

/** Valeur canonique « T3 2026 », ou le libellé tel quel s'il ne se lit pas, null si vide. */
export function trimestreIrlCanonique(libelle: string | null | undefined): string | null {
  const brut = (libelle ?? "").trim();
  if (!brut) return null;
  const lu = lireTrimestreIrl(brut);
  return lu?.annee ? `T${lu.numero} ${lu.annee}` : brut;
}

/** « 3e trimestre 2026 » : la mention imprimée au contrat et montrée au récapitulatif. null quand l'année manque
 * (« T3 ») ou que le libellé ne se lit pas. Les modèles de contrat impriment alors la valeur telle quelle : le contrat
 * d'un circuit de signature déjà parti doit se recalculer à l'identique pour être activé (empreinte). */
export function libelleTrimestreIrl(libelle: string | null | undefined): string | null {
  const lu = lireTrimestreIrl(libelle);
  if (!lu?.annee) return null;
  return `${ORDINAUX[lu.numero]} trimestre ${lu.annee}`;
}

/** Le libellé à montrer à l'écran : « 3e trimestre 2026 », ou « 3e trimestre — année à préciser » pour une valeur
 * ancienne sans année (le contrat l'imprime telle quelle ; relecture BAIL-02). */
export function libelleTrimestreIrlEcran(libelle: string | null | undefined): string | null {
  const lu = lireTrimestreIrl(libelle);
  if (!lu) return (libelle ?? "").trim() || null;
  return lu.annee ? `${ORDINAUX[lu.numero]} trimestre ${lu.annee}` : `${ORDINAUX[lu.numero]} trimestre — année à préciser`;
}

/** Date (approchée) de publication par l'INSEE de l'indice du trimestre `numero` de l'année `annee` : mi-avril pour T1,
 * mi-juillet pour T2, mi-octobre pour T3, mi-janvier suivant pour T4. Même règle que la reprise de la migration
 * 20261028100300. */
export function publicationTrimestreIrl(numero: number, annee: number): string {
  return numero === 4 ? `${annee + 1}-01-15` : `${annee}-${String(numero * 3 + 1).padStart(2, "0")}-15`;
}

/** L'année plausible de l'indice de référence : le dernier trimestre de ce numéro déjà publié à la date de référence
 * (conclusion prévue, à défaut entrée, à défaut aujourd'hui). */
export function anneeTrimestreIrlPlausible(numero: number, reference: string): number {
  let annee = Number(reference.slice(0, 4));
  while (publicationTrimestreIrl(numero, annee) > reference) annee--;
  return annee;
}

/** Années proposées : de 1990 à l'année en cours, la plus récente d'abord. */
export function anneesTrimestreIrl(aujourdhui: string): number[] {
  const fin = Number(aujourdhui.slice(0, 4));
  return Array.from({ length: fin - 1990 + 1 }, (_, i) => fin - i);
}
