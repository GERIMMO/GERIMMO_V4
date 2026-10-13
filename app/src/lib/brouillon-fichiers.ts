import { compteDeLaCle } from "./copies-locales";

/** Copies sur cet appareil uniquement. Les File sont conservés tels quels par
 * IndexedDB : aucune nouvelle compression à la reprise, donc mêmes empreintes. */
export const DUREE_COPIE_FICHIERS = 7 * 24 * 60 * 60 * 1000;
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
export class ConflitCopieLocale extends Error {}
async function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const demande = indexedDB.open("gerimmo-reprises", 1);
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
      // Purge à la prochaine utilisation : les copies périmées, et celles des AUTRES comptes (audit du 13/10, PR178-A-01 :
      // sur un appareil partagé, la copie d'un compte ne doit pas rester pour le suivant).
      const compteCourant = compteDeLaCle(cle);
      const curseur = copies.openCursor();
      curseur.onsuccess = () => {
        const c = curseur.result;
        if (!c) return;
        const proprietaire = typeof c.key === "string" ? compteDeLaCle(c.key) : null;
        const autreCompte = compteCourant !== null && proprietaire !== null && proprietaire !== compteCourant;
        if (!copieRecente(c.value) || autreCompte) c.delete();
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
