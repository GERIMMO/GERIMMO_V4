import { BASE_COPIES_FICHIERS, compteDeLaCle, DUREE_COPIES_LOCALES_MS } from "./copies-locales";

/** Copies sur cet appareil uniquement. Les File sont conservés tels quels par
 * IndexedDB : aucune nouvelle compression à la reprise, donc mêmes empreintes. */
export const DUREE_COPIE_FICHIERS = DUREE_COPIES_LOCALES_MS;
export type CopieFichiers<T> = { revision: string; date: number; donnees: T };
export function cleCopieFichiers(type: 'personne' | 'incident', compte: string, org: string) {
  return ["gerimmo", type, "v1", compte, org].map(encodeURIComponent).join(":");
}
export function copieRecente(copie: unknown, maintenant = Date.now()): copie is CopieFichiers<unknown> {
  if (!copie || typeof copie !== "object") return false;
  const c = copie as CopieFichiers<unknown>;
  return typeof c.revision === "string" && typeof c.date === "number" && Number.isFinite(c.date)
    && c.date <= maintenant + 60_000 && maintenant - c.date <= DUREE_COPIE_FICHIERS && "donnees" in c;
}
/**
 * Vrai si cette copie doit disparaître : périmée, illisible, ou écrite par un autre compte que `compteCourant`
 * (audit du 13/10, PR178-A-01 : sur un appareil partagé, la copie d'un compte ne doit pas rester pour le suivant).
 * Une clé qui n'a pas la forme d'une copie n'a pas de compte : seule sa péremption la juge.
 */
export function copieObsolete(cle: IDBValidKey, valeur: unknown, compteCourant: string | null, maintenant = Date.now()): boolean {
  const proprietaire = typeof cle === "string" ? compteDeLaCle(cle) : null;
  const autreCompte = compteCourant !== null && proprietaire !== null && proprietaire !== compteCourant;
  return autreCompte || !copieRecente(valeur, maintenant);
}
export class ConflitCopieLocale extends Error {}
async function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const demande = indexedDB.open(BASE_COPIES_FICHIERS, 1);
    demande.onupgradeneeded = () => demande.result.createObjectStore("copies");
    demande.onerror = () => reject(demande.error);
    demande.onblocked = () => reject(new Error("Stockage occupé"));
    demande.onsuccess = () => resolve(demande.result);
  });
}
export async function lireCopieFichiers(cle: string): Promise<CopieFichiers<unknown> | null> {
  const db = await ouvrir();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("copies", "readwrite"), copies = transaction.objectStore("copies");
      let resultat: CopieFichiers<unknown> | null = null;
      // Purge à la prochaine utilisation : les copies périmées, et celles des AUTRES comptes.
      const compteCourant = compteDeLaCle(cle);
      const curseur = copies.openCursor();
      curseur.onsuccess = () => {
        const c = curseur.result;
        if (!c) return;
        if (copieObsolete(c.key, c.value, compteCourant)) c.delete();
        else if (c.key === cle) resultat = c.value;
        c.continue();
      };
      transaction.oncomplete = () => resolve(resultat);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
/** Compare et écrit dans une seule transaction : un ancien onglet ne peut
 * ni écraser ni effacer la copie plus récente d'un autre onglet. */
export async function modifierCopieFichiers<T>(cle: string, attendue: string | null, donnees: T | null): Promise<CopieFichiers<T> | null> {
  const db = await ouvrir();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("copies", "readwrite"), copies = transaction.objectStore("copies");
      let resultat: CopieFichiers<T> | null = null, conflit = false;
      const lecture = copies.get(cle);
      lecture.onsuccess = () => {
        const ancienne = copieRecente(lecture.result) ? lecture.result : null;
        if ((ancienne?.revision ?? null) !== attendue) { conflit = true; transaction.abort(); return; }
        if (donnees === null) copies.delete(cle);
        else { resultat = { revision: crypto.randomUUID(), date: Date.now(), donnees }; copies.put(resultat, cle); }
      };
      transaction.oncomplete = () => resolve(resultat);
      transaction.onabort = () => reject(conflit ? new ConflitCopieLocale() : transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

/**
 * À l'arrivée sur une page connectée : efface d'IndexedDB les copies périmées et celles des autres comptes (audit du
 * 13/10, VER-PR178-02 : après une session expirée puis un autre compte, elles restaient jusqu'à l'ouverture de la fiche
 * personne). Ne crée jamais la base : si elle n'existe pas, l'ouverture est annulée dans sa mise à niveau. Au mieux :
 * jamais d'erreur, la personne n'attend rien.
 */
export async function purgerCopiesFichiersObsoletes(compteCourant: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await new Promise<IDBDatabase | null>(resolve => {
      const demande = indexedDB.open(BASE_COPIES_FICHIERS, 1);
      demande.onupgradeneeded = () => demande.transaction?.abort();
      demande.onerror = event => { event.preventDefault(); resolve(null); };
      demande.onblocked = () => resolve(null);
      demande.onsuccess = () => resolve(demande.result);
    });
    if (!db) return;
    try {
      await new Promise<void>(resolve => {
        const transaction = db.transaction("copies", "readwrite");
        const curseur = transaction.objectStore("copies").openCursor();
        curseur.onsuccess = () => {
          const c = curseur.result;
          if (!c) return;
          if (copieObsolete(c.key, c.value, compteCourant)) c.delete();
          c.continue();
        };
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => resolve();
        transaction.onerror = () => resolve();
      });
    } finally { db.close(); }
  } catch { /* stockage refusé ou indisponible : rien à effacer */ }
}
