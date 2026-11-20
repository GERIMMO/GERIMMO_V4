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
  it("trois modules déclarent des polices : tout nouveau venu doit respecter la règle de préchargement", () => {
    // Layout racine (interface et titres), page d'accueil (italique du héros), outils publics (police des documents).
    expect(declarants.sort()).toEqual(["src/app/layout.tsx", "src/app/page.tsx", "src/components/outils/police-document.ts"]);
  });

  it("aucune déclaration ne coupe le préchargement", () => {
    for (const chemin of declarants) expect(sansCommentaires(lire(chemin)), chemin).not.toMatch(/preload\s*:\s*false/);
  });

  it("l'italique des titres n'est déclarée que sur la page d'accueil, seule à l'utiliser", () => {
    expect(sansCommentaires(lire("src/app/layout.tsx"))).not.toMatch(/italic/);
    const accueil = sansCommentaires(lire("src/app/page.tsx"));
    expect(accueil).toMatch(/fraunces-latin-opsz-italic\.woff2/);
    expect(accueil).toContain("afficheItalique.variable");
  });

  it("un titre en italique ne retombe jamais sur une oblique fabriquée par le navigateur", () => {
    const regle = /\.gerimmo-prestige :is\(h1, h2\) :is\(em, i\) \{([^}]*)\}/.exec(lire("src/app/systeme.css"))?.[1] ?? "";
    expect(regle).toContain("var(--font-affiche-italique, var(--font-affiche))");
    expect(regle).toContain("font-synthesis: none");
  });
});
