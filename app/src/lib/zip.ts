// UNE ARCHIVE ZIP, SANS DÉPENDANCE (export complet, R49, 24/10/2026).
//
// Le format le plus simple que lisent tous les systèmes : une entrée par fichier (compression « deflate » de Node, ou
// rangement tel quel quand la compression ne gagne rien), noms en UTF-8 (bit 11), un répertoire central, sans ZIP64.
// Au-delà de 65 535 entrées ou de 4 Gio, l'archive est refusée plutôt que produite fausse : l'export complet borne
// d'ailleurs sa taille bien en deçà.

import { crc32, deflateRawSync } from "node:zlib";

export type EntreeZip = { nom: string; contenu: Uint8Array | string; date?: Date };

const LIMITE_32 = 0xffffffff;

function dateDos(d: Date): { heure: number; jour: number } {
  const annee = Math.min(Math.max(d.getUTCFullYear(), 1980), 2107);
  return {
    heure: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    jour: ((annee - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

/** Un nom d'entrée sûr : relatif, séparateurs « / », sans « .. » ni racine. */
export function nomZipSur(nom: string): string {
  const parties = nom.replace(/\\/g, "/").split("/").filter((p) => p !== "" && p !== "." && p !== "..");
  if (parties.length === 0) throw new Error("Nom d'entrée vide.");
  return parties.join("/");
}

export function creerZip(entrees: EntreeZip[]): Buffer {
  if (entrees.length > 0xffff) throw new Error("Trop d'entrées pour une archive ZIP sans ZIP64.");
  const locaux: Buffer[] = [];
  const central: Buffer[] = [];
  let decalage = 0;
  for (const e of entrees) {
    const nom = Buffer.from(nomZipSur(e.nom), "utf8");
    const brut = typeof e.contenu === "string" ? Buffer.from(e.contenu, "utf8") : Buffer.from(e.contenu);
    const compresse = deflateRawSync(brut);
    const garder = compresse.length < brut.length;
    const donnees = garder ? compresse : brut;
    const methode = garder ? 8 : 0;
    const somme = crc32(brut) >>> 0;
    const { heure, jour } = dateDos(e.date ?? new Date());
    if (brut.length > LIMITE_32 || donnees.length > LIMITE_32 || decalage > LIMITE_32) {
      throw new Error("Archive trop volumineuse pour le format ZIP sans ZIP64.");
    }
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(methode, 8);
    local.writeUInt16LE(heure, 10);
    local.writeUInt16LE(jour, 12);
    local.writeUInt32LE(somme, 14);
    local.writeUInt32LE(donnees.length, 18);
    local.writeUInt32LE(brut.length, 22);
    local.writeUInt16LE(nom.length, 26);
    local.writeUInt16LE(0, 28);
    locaux.push(local, nom, donnees);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(methode, 10);
    c.writeUInt16LE(heure, 12);
    c.writeUInt16LE(jour, 14);
    c.writeUInt32LE(somme, 16);
    c.writeUInt32LE(donnees.length, 20);
    c.writeUInt32LE(brut.length, 24);
    c.writeUInt16LE(nom.length, 28);
    c.writeUInt16LE(0, 30);
    c.writeUInt16LE(0, 32);
    c.writeUInt16LE(0, 34);
    c.writeUInt16LE(0, 36);
    c.writeUInt32LE(0, 38);
    c.writeUInt32LE(decalage, 42);
    central.push(c, nom);
    decalage += local.length + nom.length + donnees.length;
  }
  const repertoire = Buffer.concat(central);
  if (decalage > LIMITE_32 || repertoire.length > LIMITE_32) throw new Error("Archive trop volumineuse pour le format ZIP sans ZIP64.");
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(entrees.length, 8);
  fin.writeUInt16LE(entrees.length, 10);
  fin.writeUInt32LE(repertoire.length, 12);
  fin.writeUInt32LE(decalage, 16);
  fin.writeUInt16LE(0, 20);
  return Buffer.concat([...locaux, repertoire, fin]);
}
