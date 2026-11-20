/**
 * Polices : toute police déclarée est préchargée (constat du 20/11/2026, moteur WebKit — Safari).
 *
 * Une police déclarée avec `preload: false` existe pour le navigateur sans être chargée. WebKit en conclut que « du
 * contenu arrive encore » : tant que l'écran ne montre que « Chargement de la page… », il ne dessine rien avant la fin
 * du chargement des scripts. Sur un réseau lent, la page reste figée au lieu d'afficher son contenu dès qu'il arrive,
 * et le bouton d'envoi n'apparaît qu'une fois déjà actif (parcours e2e/bouton-envoi-hydratation, suite WebKit).
 *
 * Ce test garde la règle dans le code : une police se déclare là où elle sert, et elle se précharge.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const fichiers = (dossier: string): string[] => readdirSync(dossier).flatMap(nom => {
  const chemin = join(dossier, nom);
  return statSync(chemin).isDirectory() ? fichiers(chemin) : /\.tsx?$/.test(nom) ? [chemin] : [];
});
const lire = (chemin: string) => readFileSync(chemin, "utf8");
const sansCommentaires = (texte: string) => texte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const declarants = fichiers("src").filter(chemin => /from "next\/font\/(local|google)"/.test(lire(chemin)));

describe("polices : aucune police déclarée sans être préchargée", () => {
  it("deux modules déclarent des polices : tout nouveau venu doit respecter la règle de préchargement", () => {
    // Layout racine (interface, chiffres et titres) et outils publics (police des documents).
    expect(declarants.sort()).toEqual(["src/app/layout.tsx", "src/components/outils/police-document.ts"]);
  });

  it("aucune déclaration ne coupe le préchargement", () => {
    for (const chemin of declarants) expect(sansCommentaires(lire(chemin)), chemin).not.toMatch(/preload\s*:\s*false/);
  });

  it("aucun fichier de police italique : l'emphase d'un titre se marque par la couleur, jamais par une oblique fabriquée", () => {
    for (const chemin of declarants) expect(sansCommentaires(lire(chemin)), chemin).not.toMatch(/italic/);
    expect(readdirSync("src/app/polices").filter(nom => /italic/.test(nom))).toEqual([]);
    const regle = /\.gerimmo-prestige :is\(h1, h2\) :is\(em, i\) \{([^}]*)\}/.exec(lire("src/app/systeme.css"))?.[1] ?? "";
    expect(regle).toContain("font-style: normal");
    expect(regle).toContain("font-synthesis: none");
  });
});
