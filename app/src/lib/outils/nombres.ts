// OUTILS GRATUITS — lecture et écriture des nombres (29/09).
//
// Les formulaires publics se remplissent à la française : « 146,68 »,
// « 1 940 », « 2,7 ». Un champ vide ou illisible vaut `null`, jamais 0 : un
// calcul ne se fait pas sur un montant qu'on n'a pas saisi.

/** Lit un nombre saisi (virgule ou point décimal, espaces ignorés). */
export function lireNombre(saisie: string | null | undefined): number | null {
  if (saisie == null) return null;
  const propre = String(saisie)
    .replace(/[\s  ]/g, "")
    .replace(/€|%/g, "")
    .replace(",", ".");
  if (!propre || !/^-?\d*\.?\d+$/.test(propre)) return null;
  const n = Number(propre);
  return Number.isFinite(n) ? n : null;
}

/** Arrondi au centime le plus proche (demi-centime vers le haut). */
export function arrondiCentime(n: number): number {
  // Le décalage corrige les flottants du type 1,005 × 100 = 100,49999…
  return Math.round(n * 100 + (n >= 0 ? 1e-7 : -1e-7)) / 100;
}

/** « 1 234,50 € » (espaces insécables, deux décimales). */
export function formaterEuros(n: number): string {
  return `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** « 146,68 » : un nombre sans unité, décimales utiles seulement. */
export function formaterNombre(n: number, decimalesMax = 2): string {
  return n.toLocaleString("fr-FR", { maximumFractionDigits: decimalesMax });
}

/** « 2,7 % » à partir d'une fraction (0,027). */
export function formaterPourcent(fraction: number, decimalesMax = 2): string {
  return `${(fraction * 100).toLocaleString("fr-FR", { maximumFractionDigits: decimalesMax })} %`;
}

/** La date du jour au format ISO (AAAA-MM-JJ), à l'heure locale du navigateur. */
export function aujourdhuiIso(maintenant: Date = new Date()): string {
  const a = maintenant.getFullYear();
  const m = String(maintenant.getMonth() + 1).padStart(2, "0");
  const j = String(maintenant.getDate()).padStart(2, "0");
  return `${a}-${m}-${j}`;
}

/** « 29/09/2026 » depuis « 2026-09-29 » ; chaîne vide si la date est illisible. */
export function formaterDateIso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}
