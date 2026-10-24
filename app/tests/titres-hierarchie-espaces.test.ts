import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// DES-A-03 : dans l'espace locataire et sur quelques écrans propriétaire, les titres de carte
// étaient des <h3> directement sous le <h1>, sans <h2> (WCAG 1.3.1, axe : heading-order).
// Les titres de carte sont des <h2> ; seuls restent des <h3> les sous-titres qui suivent un <h2>.
const fichiers = (dossier: string): string[] => readdirSync(dossier).flatMap(nom => {
  const chemin = join(dossier, nom);
  return statSync(chemin).isDirectory() ? fichiers(chemin) : /\.tsx$/.test(nom) ? [chemin] : [];
});
const PERIMETRE = [
  ...fichiers("src/app/locataire"),
  ...fichiers("src/app/compte"),
  "src/app/agence/[orgId]/profil/page.tsx",
  "src/app/agence/[orgId]/parc/import/page.tsx",
  "src/app/agence/[orgId]/comptabilite/reprise/page.tsx",
  "src/app/agence/[orgId]/documents/page.tsx",
];
// Sous-titres légitimes : ils suivent le <h2> de leur carte (« Votre signalement », « Les colonnes… » sous « 1. Le gabarit »).
const SOUS_TITRES = [/Qui paiera la réparation/, /plat \? "text-sm font-medium"/, /Les colonnes du fichier/];

describe("DES-A-03 : hiérarchie des titres", () => {
  it("aucun titre de carte n'est resté en <h3> dans le périmètre", () => {
    const restants = PERIMETRE.flatMap(f => readFileSync(f, "utf8").split("\n")
      .map((ligne, i) => ({ f, n: i + 1, ligne }))
      .filter(({ ligne }) => /<h3[\s>]/.test(ligne) && !ligne.trim().startsWith("{/*") && !SOUS_TITRES.some(re => re.test(ligne))));
    expect(restants.map(r => `${r.f}:${r.n}`)).toEqual([]);
  });

  it("les <h2> convertis portent la classe qui leur rend le dessin d'un <h3>", () => {
    const avecClasse = PERIMETRE.flatMap(f => (readFileSync(f, "utf8").match(/<h2[^>]*titre-carte[^>]*>/g) ?? []));
    // 38 depuis le 24/10 : carte « Conditions générales » de « Sécurité du compte » (plan de conformité, lot 1A).
    expect(avecClasse.length).toBe(38);
  });

  it("prestige.css rend leur apparence aux <h2 class=titre-carte> malgré `.gerimmo-prestige h2`", () => {
    const css = readFileSync("src/app/prestige.css", "utf8");
    const regle = /\.gerimmo-prestige h2\.titre-carte\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(regle).toMatch(/font-family:\s*var\(--font-interface\), sans-serif/);
    expect(regle).toMatch(/font-size:\s*16px/);
    expect(regle).toMatch(/font-weight:\s*revert-layer/);
    expect(regle).toMatch(/line-height:\s*revert-layer/);
    // Plus spécifique que `.gerimmo-prestige h2` : elle doit venir d'un sélecteur à deux classes/éléments au moins.
    expect(css.indexOf(".gerimmo-prestige h2.titre-carte")).toBeGreaterThan(css.indexOf(".gerimmo-prestige h2 { font-size: 24px; }"));
  });
});
