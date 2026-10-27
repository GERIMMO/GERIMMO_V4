/**
 * Chaque fichier de `public/illustrations` est référencé par le code, et chaque illustration référencée existe
 * (audit #264, TRV-05 : la refonte avait ajouté 14 photos d'ambiance, ≈ 2,4 Mo, et un composant que rien n'utilisait).
 *
 * Les photos d'ambiance (`accueil-evenements/<id>.webp`) sont désignées par un chemin construit à l'exécution : on
 * reconstitue la liste des scènes en parcourant une année civile avec le calendrier lui-même, comme son propre test.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ambianceAccueil } from "../src/lib/ambiance-accueil";

const RACINE = path.resolve(__dirname, "..");
const DOSSIER_PUBLIC = path.join(RACINE, "public");
const DOSSIER_SRC = path.join(RACINE, "src");

function fichiers(dossier: string, extensions?: RegExp): string[] {
  return readdirSync(dossier, { recursive: true, encoding: "utf8" })
    .map((relatif) => path.join(dossier, relatif))
    .filter((chemin) => statSync(chemin).isFile() && (!extensions || extensions.test(chemin)));
}

/** Chemins `/illustrations/…` écrits en clair dans le code (TSX, TS, CSS), sans les gabarits `${…}`. */
function illustrationsCitees(): Set<string> {
  const citees = new Set<string>();
  for (const fichier of fichiers(DOSSIER_SRC, /\.(tsx?|css)$/)) {
    for (const [, chemin] of readFileSync(fichier, "utf8").matchAll(/\/illustrations\/([\w./-]+\.(?:webp|jpe?g|png|svg))/g)) {
      citees.add(chemin);
    }
  }
  return citees;
}

/** Les scènes du calendrier : chaque jour d'une année en donne une, et toutes paraissent au moins une fois. */
function photosDesAmbiances(): Set<string> {
  const photos = new Set<string>();
  const jour = new Date("2026-01-01T12:00:00Z");
  while (jour.getUTCFullYear() === 2026) {
    photos.add(ambianceAccueil(jour.toISOString().slice(0, 10)).image.replace(/^\/illustrations\//, ""));
    jour.setUTCDate(jour.getUTCDate() + 1);
  }
  return photos;
}

describe("illustrations publiques et code : rien d'orphelin, rien de manquant", () => {
  const presentes = fichiers(path.join(DOSSIER_PUBLIC, "illustrations"))
    .map((chemin) => path.relative(path.join(DOSSIER_PUBLIC, "illustrations"), chemin).split(path.sep).join("/"))
    .sort();
  const referencees = new Set([...illustrationsCitees(), ...photosDesAmbiances()]);

  it("le dossier contient bien les photos et motifs du site", () => {
    expect(presentes.length).toBeGreaterThan(30);
    expect(referencees.size).toBeGreaterThan(30);
  });

  it("aucun fichier de public/illustrations n'est sans référence dans src/", () => {
    const orphelines = presentes.filter((fichier) => !referencees.has(fichier));
    expect(orphelines).toEqual([]);
  });

  it("chaque illustration référencée par le code existe", () => {
    const manquantes = [...referencees].filter((fichier) => !existsSync(path.join(DOSSIER_PUBLIC, "illustrations", fichier))).sort();
    expect(manquantes).toEqual([]);
  });
});
