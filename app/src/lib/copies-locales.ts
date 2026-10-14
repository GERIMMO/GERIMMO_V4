// Les copies de saisie gardées sur l'appareil (brouillons de fiche, d'incident, de devis, de bien) ne doivent pas
// survivre à la personne qui les a écrites.
//
// Audit du 13/10/2026 (PR178-A-01, PR178-A-07) : ces copies, qui contiennent une identité, une naissance, une adresse,
// une pièce d'identité ou le prix d'un devis, restaient 7 jours dans IndexedDB et le localStorage, y compris après la
// déconnexion, lisibles par du JavaScript de la même origine. La déconnexion les efface maintenant, et un compte qui
// ouvre un formulaire efface celles des autres comptes.
//
// Audit du 13/10/2026, vérification (VER-PR178-02, 05 ; VER-SECURITE-01) : la purge ne couvrait que « déconnexion
// cliquée, réseau disponible ». Elle part maintenant (1) à l'arrivée sur /connexion?raison=deconnecte, donc seulement
// quand la déconnexion a réussi, (2) à l'arrivée sur toute page connectée pour les copies d'un autre compte ou périmées
// (session expirée puis autre compte), (3) y compris pour la quittance mémorisée par l'outil public.

import { purgerBrouillonsEdl, type BilanBrouillonsEdl } from "./edl-brouillon";
import { CLE_STOCKAGE_QUITTANCE } from "./outils/quittance";

export const PREFIXE_COPIES_LOCALES = "gerimmo:";
export const BASE_COPIES_FICHIERS = "gerimmo-reprises";
/** Valeur du paramètre `raison` de /connexion quand la déconnexion vient d'aboutir. */
export const RAISON_DECONNEXION = "deconnecte";
/** Durée annoncée à l'écran (« 7 jours ») : brouillon de lot, devis, fiche personne, incident. */
export const DUREE_COPIES_LOCALES_MS = 7 * 24 * 60 * 60 * 1000;

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

/**
 * Les clés effacées à la déconnexion : les copies de saisie (« gerimmo:… ») et la quittance que l'outil public retient
 * sur l'appareil à la demande de la personne (identités, adresses, montants).
 *
 * Le brouillon d'état des lieux (« gerimmo-edl-brouillon:<compte>:<id> ») n'en fait PAS partie : RM-19.1.1, 19.1.2 et 19.1.6
 * en font la copie de travail hors ligne de l'agent, synchronisée au retour du réseau, avec un indicateur « données non
 * remontées ». L'effacer à l'aveugle détruirait des relevés jamais envoyés. D15 (décision du 14/10/2026) : il est effacé à
 * la déconnexion seulement s'il n'a aucune ligne non synchronisée, sinon conservé et signalé (`purgerBrouillonsEdl`), et sa
 * clé est rattachée au compte.
 */
export function estCleDeCopie(cle: string): boolean {
  return cle.startsWith(PREFIXE_COPIES_LOCALES) || cle === CLE_STOCKAGE_QUITTANCE;
}

/**
 * Efface les copies locales de saisie (déconnexion). Au mieux : jamais d'erreur, jamais d'attente.
 *
 * Les brouillons d'état des lieux suivent leur propre règle (D15) : effacés s'ils n'ont aucune ligne non synchronisée, gardés
 * sinon. Le bilan dit combien sont gardés, pour que la page de connexion en avertisse la personne.
 */
export function purgerCopiesLocales(): BilanBrouillonsEdl {
  for (const nom of ["localStorage", "sessionStorage"] as const) {
    try {
      const stockage = globalThis[nom] as Stockage | undefined;
      if (stockage) for (const k of cles(stockage)) if (estCleDeCopie(k)) stockage.removeItem(k);
    } catch { /* stockage refusé : rien à effacer */ }
  }
  try { globalThis.indexedDB?.deleteDatabase(BASE_COPIES_FICHIERS); } catch { /* idem */ }
  return purgerBrouillonsEdl();
}

/**
 * Vrai si la copie a plus de 7 jours. Les copies de lot et de devis portent « enregistreLe » (ms) ; ce qui n'a pas cette
 * forme (autre version, valeur illisible) est laissé à son lecteur, qui sait l'écarter.
 */
export function copieExpiree(brut: string | null, maintenant = Date.now()): boolean {
  if (!brut) return false;
  try {
    const date = (JSON.parse(brut) as { enregistreLe?: unknown } | null)?.enregistreLe;
    return typeof date === "number" && Number.isFinite(date) && maintenant - date > DUREE_COPIES_LOCALES_MS;
  } catch { return false; }
}

/**
 * Efface les copies périmées du localStorage. Le texte « supprimées au bout de 7 jours » n'était vrai que pour la fiche
 * personne et l'incident (IndexedDB, relues à chaque ouverture) : le brouillon de lot et le devis n'étaient évalués qu'à
 * la relecture de LEUR clé, donc jamais si la personne ne rouvrait pas ce formulaire.
 */
export function purgerCopiesPerimees(stockage: (Stockage & Pick<Storage, "getItem">) | undefined = safeLocalStorage(), maintenant = Date.now()): number {
  if (!stockage) return 0;
  let n = 0;
  try {
    for (const k of cles(stockage)) {
      if (compteDeLaCle(k) !== null && copieExpiree(stockage.getItem(k), maintenant)) { stockage.removeItem(k); n++; }
    }
  } catch { /* stockage refusé */ }
  return n;
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
