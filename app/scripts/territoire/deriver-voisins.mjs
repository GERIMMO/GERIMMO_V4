// Dériver la contiguïté des départements d'un fond de carte — pas de mémoire.
//
// POURQUOI UN SCRIPT. La brique du score a besoin de savoir quel département en
// touche un autre (« le département voisin »). Une liste écrite de tête est
// invérifiable ; celle-ci se recalcule à partir d'un fichier public, daté et
// empreinté, et le résultat est versionné dans src/data/departements-voisins.json
// avec la méthode et des contrôles connus.
//
//   node scripts/territoire/deriver-voisins.mjs
//
// Méthode : deux départements sont voisins s'ils partagent au moins deux
// sommets de frontière (coordonnées arrondies à 1e-6). Le fond de carte est
// une simplification topologique : les frontières communes y sont décrites
// par les mêmes points de part et d'autre, ce qui rend le test exact.
// L'outre-mer n'a pas de voisin, par construction.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const URL_SOURCE =
  "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson";
const SORTIE = new URL("../../src/data/departements-voisins.json", import.meta.url);
const REFERENTIEL = new URL("../../src/lib/territoire.ts", import.meta.url);

const reponse = await fetch(URL_SOURCE);
if (!reponse.ok) throw new Error(`fond de carte injoignable : ${reponse.status}`);
const brut = Buffer.from(await reponse.arrayBuffer());
const sha256 = createHash("sha256").update(brut).digest("hex");
const geo = JSON.parse(brut.toString("utf-8"));

const sommets = (geometrie) => {
  const pts = new Set();
  const ring = (r) => {
    for (const [x, y] of r) pts.add(`${x.toFixed(6)},${y.toFixed(6)}`);
  };
  if (geometrie.type === "Polygon") geometrie.coordinates.forEach(ring);
  else if (geometrie.type === "MultiPolygon")
    geometrie.coordinates.forEach((poly) => poly.forEach(ring));
  return pts;
};

const parCode = new Map();
for (const f of geo.features) parCode.set(f.properties.code, sommets(f.geometry));

const codes = [...readFileSync(REFERENTIEL, "utf-8").matchAll(/code: "([0-9AB]{2,3})"/g)].map((m) => m[1]);
if (codes.length !== 101) throw new Error(`référentiel : ${codes.length} départements lus, 101 attendus`);

const voisins = Object.fromEntries(codes.map((c) => [c, []]));
const metropole = codes.filter((c) => parCode.has(c));
for (let i = 0; i < metropole.length; i += 1) {
  for (let j = i + 1; j < metropole.length; j += 1) {
    const a = metropole[i];
    const b = metropole[j];
    let partages = 0;
    for (const p of parCode.get(a)) if (parCode.get(b).has(p) && (partages += 1) >= 2) break;
    if (partages >= 2) {
      voisins[a].push(b);
      voisins[b].push(a);
    }
  }
}
for (const c of codes) voisins[c].sort();

// Contrôles connus : une dérivation qui les rate ne s'écrit pas.
const attendus = {
  "75": ["92", "93", "94"],
  "91": ["28", "45", "77", "78", "92", "94"],
  "59": ["02", "62", "80"],
  "2A": ["2B"],
  "29": ["22", "56"],
};
for (const [code, liste] of Object.entries(attendus)) {
  if (JSON.stringify(voisins[code]) !== JSON.stringify(liste))
    throw new Error(`contrôle ${code} : obtenu ${voisins[code]}, attendu ${liste}`);
}
const sansVoisin = metropole.filter((c) => voisins[c].length === 0);
if (sansVoisin.length > 0) throw new Error(`sans voisin : ${sansVoisin}`);

writeFileSync(
  SORTIE,
  JSON.stringify(
    {
      source: {
        libelle:
          "Contours simplifiés des départements (france-geojson, Grégoire David), dérivés des données IGN/OSM",
        url: URL_SOURCE,
        sha256,
        recupere_le: new Date().toISOString().slice(0, 10),
        methode:
          "deux départements sont voisins s'ils partagent au moins deux sommets de frontière (coordonnées arrondies à 1e-6) ; script scripts/territoire/deriver-voisins.mjs",
        controles:
          "75 → 92,93,94 ; 91 → 28,45,77,78,92,94 ; 59 → 02,62,80 ; 2A ↔ 2B ; 29 → 22,56 ; aucun département métropolitain sans voisin",
      },
      voisins,
    },
    null,
    1
  ) + "\n"
);
console.log(`voisins écrits : ${metropole.length} départements métropolitains, empreinte ${sha256.slice(0, 16)}`);
