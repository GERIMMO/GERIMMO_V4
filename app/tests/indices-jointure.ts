import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/** Un indice de jointure PostgREST écrit dans le code : `cible!indice(…)` (hors `!inner` / `!left`). */
export type IndiceJointure = { cible: string; indice: string; fichiers: string[] };

const RACINE = join(__dirname, "..", "src");

/** Tous les indices `table!indice(` du code applicatif, regroupés. */
export function indicesDuCode(racine = RACINE): IndiceJointure[] {
  const trouves = new Map<string, IndiceJointure>();
  const parcourir = (dossier: string) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) { parcourir(chemin); continue; }
      if (!/\.(ts|tsx)$/.test(entree.name)) continue;
      for (const m of readFileSync(chemin, "utf8").matchAll(/([a-z_]+)!([a-z_0-9]+)(?:!(?:inner|left))?\(/g)) {
        if (m[2] === "inner" || m[2] === "left") continue;
        const cle = `${m[1]}!${m[2]}`;
        const connu = trouves.get(cle) ?? { cible: m[1], indice: m[2], fichiers: [] };
        const fichier = relative(racine, chemin);
        if (!connu.fichiers.includes(fichier)) connu.fichiers.push(fichier);
        trouves.set(cle, connu);
      }
    }
  };
  parcourir(racine);
  return [...trouves.values()].sort((a, b) => `${a.cible}!${a.indice}`.localeCompare(`${b.cible}!${b.indice}`));
}
