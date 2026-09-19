// Le parrainage — la forme du code, et le lien qui le porte.
//
// LA MÉCANIQUE, PAS L'AVANTAGE (wiki : « Expansion territoriale autonome »,
// 19/09). Pour les particuliers, Gerimmo n'a pas le droit de démarcher : le
// seul moteur est le bouche-à-oreille, et il ne se mesure que si l'on sait
// qui a amené qui. Ce module ne sait rien de la base : il dit à quoi ressemble
// un code, comment on le lit dans une saisie ou une adresse, et comment on le
// partage. Ce que le parrain et le filleul y gagnent est une décision du
// porteur du projet, encore ouverte — elle viendra dans sa propre brique.

/** Huit caractères hexadécimaux en capitales, tels que la base les engendre. */
export const FORME_CODE = /^[0-9A-F]{8}$/;

/**
 * Lit un code tel qu'une personne l'a tapé ou collé : espaces, tirets et
 * minuscules pardonnés ; « O » lu comme zéro, parce qu'un code hexadécimal ne
 * contient pas de O et que la confusion est la plus fréquente.
 */
export function normaliserCode(saisie: string | null | undefined): string | null {
  const c = (saisie ?? "")
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0");
  return FORME_CODE.test(c) ? c : null;
}

/** Le lien d'inscription qui porte le code : `/inscription?parrain=…`. */
export function lienDeParrainage(site: string, code: string): string {
  return `${site.replace(/\/+$/, "")}/inscription?parrain=${encodeURIComponent(code)}`;
}

/** Le code porté par une adresse d'inscription, s'il a la bonne forme. */
export function codeDeLaRecherche(recherche: URLSearchParams | Record<string, string | string[] | undefined>): string | null {
  const brut =
    recherche instanceof URLSearchParams
      ? recherche.get("parrain")
      : Array.isArray(recherche.parrain)
        ? recherche.parrain[0]
        : recherche.parrain;
  return normaliserCode(brut);
}
