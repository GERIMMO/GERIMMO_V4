// Les copies de saisie gardées sur l'appareil (brouillons de fiche, d'incident, de devis, de bien) ne doivent pas
// survivre à la personne qui les a écrites.
//
// Audit du 13/10/2026 (PR178-A-01, PR178-A-07) : ces copies, qui contiennent une identité, une naissance, une adresse,
// une pièce d'identité ou le prix d'un devis, restaient 7 jours dans IndexedDB et le localStorage, y compris après la
// déconnexion, lisibles par du JavaScript de la même origine. La déconnexion les efface maintenant, et un compte qui
// ouvre un formulaire efface celles des autres comptes.

export const PREFIXE_COPIES_LOCALES = "gerimmo:";
export const BASE_COPIES_FICHIERS = "gerimmo-reprises";

/** « gerimmo:<type>:v1:<compte>:<suite> » : le compte propriétaire de la copie, ou null si la clé n'a pas cette forme. */
export function compteDeLaCle(cle: string): string | null {
  if (!cle.startsWith(PREFIXE_COPIES_LOCALES)) return null;
  const morceaux = cle.split(":");
  if (morceaux.length < 5) return null;
  try { return decodeURIComponent(morceaux[3]); } catch { return null; }
}

type Stockage = Pick<Storage, "length" | "key" | "removeItem">;
function cles(stockage: Stockage): string[] {
  const liste: string[] = [];
  for (let i = 0; i < stockage.length; i++) { const k = stockage.key(i); if (k) liste.push(k); }
  return liste;
}

/** Efface toutes les copies locales de saisie (déconnexion). Au mieux : jamais d'erreur, jamais d'attente. */
export function purgerCopiesLocales(): void {
  for (const nom of ["localStorage", "sessionStorage"] as const) {
    try {
      const stockage = globalThis[nom] as Stockage | undefined;
      if (stockage) for (const k of cles(stockage)) if (k.startsWith(PREFIXE_COPIES_LOCALES)) stockage.removeItem(k);
    } catch { /* stockage refusé : rien à effacer */ }
  }
  try { globalThis.indexedDB?.deleteDatabase(BASE_COPIES_FICHIERS); } catch { /* idem */ }
}

/** Efface les copies du localStorage qui appartiennent à un autre compte que `compteCourant`. */
export function purgerCopiesAutresComptes(compteCourant: string, stockage: Stockage | undefined = safeLocalStorage()): number {
  if (!stockage) return 0;
  let n = 0;
  try {
    for (const k of cles(stockage)) {
      const proprietaire = compteDeLaCle(k);
      if (proprietaire !== null && proprietaire !== compteCourant) { stockage.removeItem(k); n++; }
    }
  } catch { /* stockage refusé */ }
  return n;
}
function safeLocalStorage(): Storage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}
