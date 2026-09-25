/**
 * `.env.example` décrit toute variable que le code lit (audit 25/09, O1).
 *
 * Sept variables lues par le code n'y figuraient pas (clé OpenAI sous deux
 * noms, Yousign, sauvegarde) : une variable non écrite quelque part est une
 * variable qu'on redécouvre en lisant le code, la nuit où elle manque. Le test
 * relève chaque `process.env.X` / `env.X` de src/, scripts/ et e2e/ et exige
 * qu'il soit nommé dans le fichier — comme variable à remplir, ou dans un
 * commentaire pour celles que la plateforme pose elle-même.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RACINE = path.resolve(__dirname, "..");
const EXEMPLE = fs.readFileSync(path.join(RACINE, ".env.example"), "utf8");

function fichiers(dossier: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
    const chemin = path.join(dossier, e.name);
    if (e.isDirectory()) {
      if (!["node_modules", ".next", ".auth", ".audit"].includes(e.name)) fichiers(chemin, acc);
    } else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) acc.push(chemin);
  }
  return acc;
}

function variablesLues(): Set<string> {
  const noms = new Set<string>();
  for (const f of ["src", "scripts", "e2e"].flatMap((d) => fichiers(path.join(RACINE, d)))) {
    const texte = fs.readFileSync(f, "utf8");
    for (const m of texte.matchAll(/(?:process\.env|\benv)\.([A-Z][A-Z0-9_]{2,})\b/g)) {
      // PATH est celui du système, transmis tel quel à pg_dump.
      if (m[1] !== "PATH") noms.add(m[1]);
    }
  }
  return noms;
}

describe(".env.example", () => {
  it("nomme chaque variable lue par le code", () => {
    const manquantes = [...variablesLues()].filter((v) => !new RegExp(`\\b${v}\\b`).test(EXEMPLE));
    expect(manquantes).toEqual([]);
  });

  it("commente chaque variable à remplir, sur la ligne au-dessus ou la même ligne", () => {
    const lignes = EXEMPLE.split("\n");
    const sansCommentaire: string[] = [];
    lignes.forEach((l, i) => {
      const m = l.match(/^([A-Z][A-Z0-9_]+)=/);
      if (!m) return;
      const memeLigne = l.includes("#");
      // Un bloc de variables consécutives partage le commentaire posé au-dessus
      // de la première (TEST_*, VERCEL_*) : on remonte jusqu'au commentaire.
      let j = i - 1;
      while (j >= 0 && /^[A-Z][A-Z0-9_]+=/.test(lignes[j])) j--;
      const auDessus = j >= 0 && lignes[j].startsWith("#");
      if (!memeLigne && !auDessus) sansCommentaire.push(m[1]);
    });
    expect(sansCommentaire).toEqual([]);
  });

  it("ne porte aucune valeur qui ressemble à un secret", () => {
    for (const l of EXEMPLE.split("\n")) {
      const m = l.match(/^[A-Z][A-Z0-9_]+=(.*)$/);
      if (!m) continue;
      expect(m[1].trim().split("#")[0].trim()).not.toMatch(/^(sk_|whsec_|eyJ|re_|price_|EAA)/);
    }
  });

  it("retient un seul nom pour la clé OpenAI", () => {
    expect(EXEMPLE).toMatch(/^OPENAI_API_KEY=/m);
    expect(EXEMPLE).not.toMatch(/^OPEN_AI_KEY=/m);
  });
});
