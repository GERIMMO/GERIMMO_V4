/**
 * Décision D28 A (fiches DES-A-10 et DES-B-10 du 13/10/2026) : le logo doré posé à nu sur un fond clair se lit à
 * ≈ 1,5:1 (connexion, inscription, mot de passe, page introuvable, en-têtes propriétaire, artisan à 768 px,
 * supervision). Il se pose désormais dans la tuile bleu nuit déjà utilisée à l'inscription artisan (≈ 13,6:1).
 * Aucun fichier de logo ne change : seul le fond derrière lui change.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHARTE_GERIMMO } from "../src/lib/charte-gerimmo";

const RACINE = path.resolve(__dirname, "..");
const lire = (chemin: string) => readFileSync(path.join(RACINE, chemin), "utf8");

function fichiersTsx(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiersTsx(chemin);
    return chemin.endsWith(".tsx") ? [chemin] : [];
  });
}

/** Luminance relative et rapport de contraste WCAG 2.x. */
function luminance(hex: string): number {
  const [r, v, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * v + 0.0722 * b;
}
const rapport = (a: string, b: string) => {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (clair + 0.05) / (sombre + 0.05);
};

describe("la tuile bleu nuit (D28 A)", () => {
  const prestige = lire("src/app/prestige.css");
  const composant = lire("src/components/marque-gerimmo.tsx");

  it("le composant du logo sait se poser sur la tuile", () => {
    expect(composant).toMatch(/tuile\??\s*[:=]/);
    expect(composant).toContain("marque-gerimmo-tuile");
  });

  it("la feuille de style définit UNE tuile : fond bleu nuit, rayon du thème, 4 px sur 12 px de marge", () => {
    const regle = /\.marque-gerimmo-tuile\s*\{([^}]*)\}/.exec(prestige)?.[1] ?? "";
    expect(regle).toMatch(/background:\s*#152f4b/i);
    expect(regle).toMatch(/border-radius:\s*var\(--radius-xl\)/);
    expect(regle).toMatch(/padding:\s*4px 12px/);
    // La marge ne doit pas rogner le logo : le logo garde sa largeur, la tuile s'y ajoute.
    expect(regle).toMatch(/box-sizing:\s*content-box/);
  });

  it("la tuile rend le doré de la charte lisible, là où le fond clair ne le permet pas", () => {
    const surTuile = rapport(CHARTE_GERIMMO.or, "#152f4b");
    const surFondClair = rapport(CHARTE_GERIMMO.or, CHARTE_GERIMMO.creme);
    expect(surFondClair).toBeLessThan(3);
    expect(surTuile).toBeGreaterThanOrEqual(3);
    expect(surTuile).toBeGreaterThan(surFondClair * 1.5);
  });

  it("aucune copie de la tuile en classes utilitaires : l'inscription artisan emploie la même définition", () => {
    for (const fichier of fichiersTsx(path.join(RACINE, "src"))) {
      expect(readFileSync(fichier, "utf8"), path.relative(RACINE, fichier)).not.toMatch(/bg-\[#152f4b\]/i);
    }
    expect(lire("src/app/artisan/layout.tsx")).toMatch(/<MarqueGerimmo[^>]*\btuile\b/);
  });

  it("les fichiers de logo ne changent pas (cette décision ne touche que le fond)", () => {
    expect(CHARTE_GERIMMO.logoTransparent).toBe("/logo/gerimmo-officiel-transparent.png");
    expect(CHARTE_GERIMMO.logo).toBe("/logo/gerimmo-officiel.png");
  });
});

describe("aucun logo doré à nu sur fond clair", () => {
  // Chaque <MarqueGerimmo> dit sur quoi il se pose : `surEncre` (fond bleu nuit), `tuile` (fond clair, tuile) ou une
  // exception justifiée ci-dessous. Un logo ajouté plus tard sans l'un des deux fait échouer ce test.
  const EXCEPTIONS: { fichier: string; raison: string }[] = [
    { fichier: "src/components/chrome-public.tsx", raison: "en-tête de la vitrine : le doré y est déjà assombri par vitrine.css (filter), décision antérieure" },
    { fichier: "src/app/admin/layout.tsx", raison: "colonne de la supervision, fond bleu nuit au-delà de 900 px (l'en-tête étroit, lui, porte la tuile)" },
    { fichier: "src/components/marque-organisation.tsx", raison: "repli de la marque d'organisation : la tuile se décide à l'appel (propriété `tuile`)" },
  ];
  const balises = fichiersTsx(path.join(RACINE, "src")).flatMap((f) => {
    const source = readFileSync(f, "utf8");
    return [...source.matchAll(/<MarqueGerimmo\b[^>]*>/g)].map((m) => ({
      fichier: path.relative(RACINE, f).split(path.sep).join("/"),
      balise: m[0].replace(/\s+/g, " "),
    }));
  });

  it("le test voit bien les logos du code", () => {
    expect(balises.length).toBeGreaterThanOrEqual(12);
  });

  it("chaque logo se pose sur l'encre, sur la tuile, ou fait l'objet d'une exception écrite", () => {
    const nus = balises
      .filter((b) => !/\bsurEncre\b/.test(b.balise) && !/\btuile\b/.test(b.balise))
      .filter((b) => !EXCEPTIONS.some((e) => e.fichier === b.fichier))
      .map((b) => `${b.fichier}  ${b.balise}`);
    expect(nus).toEqual([]);
  });

  it("l'exception de la colonne de supervision ne couvre pas son en-tête étroit", () => {
    const admin = balises.filter((b) => b.fichier === "src/app/admin/layout.tsx");
    expect(admin.some((b) => /\btuile\b/.test(b.balise))).toBe(true);
  });

  it("les écrans d'entrée portent la tuile : connexion, inscription, mots de passe (gabarit commun) et page introuvable", () => {
    expect(balises.some((b) => b.fichier === "src/components/coquille-auth.tsx" && /\btuile\b/.test(b.balise))).toBe(true);
    expect(balises.some((b) => b.fichier === "src/app/not-found.tsx" && /\btuile\b/.test(b.balise))).toBe(true);
  });

  it("les en-têtes de l'espace propriétaire et de l'artisan portent la tuile", () => {
    expect(lire("src/app/agence/[orgId]/layout.tsx")).toMatch(/<MarqueOrganisation[^>]*\btuile\b/);
    const artisan = balises.filter((b) => b.fichier === "src/app/artisan/layout.tsx");
    expect(artisan.filter((b) => /\btuile\b/.test(b.balise)).length).toBeGreaterThanOrEqual(2);
  });
});
