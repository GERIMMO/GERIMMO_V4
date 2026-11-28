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
// Phase 3, lot 61 (E023) : sur /compte/donnees, le titre de chaque demande suit le <h2> « Mes demandes sur mes données ».
const SOUS_TITRES = [/Qui paiera la réparation/, /plat \? "text-sm font-medium"/, /Les colonnes du fichier/, /data-titre-demande-donnees/];

describe("DES-A-03 : hiérarchie des titres", () => {
  it("aucun titre de carte n'est resté en <h3> dans le périmètre", () => {
    const restants = PERIMETRE.flatMap(f => readFileSync(f, "utf8").split("\n")
      .map((ligne, i) => ({ f, n: i + 1, ligne }))
      .filter(({ ligne }) => /<h3[\s>]/.test(ligne) && !ligne.trim().startsWith("{/*") && !SOUS_TITRES.some(re => re.test(ligne))));
    expect(restants.map(r => `${r.f}:${r.n}`)).toEqual([]);
  });

  it("les <h2> convertis portent la classe qui leur rend le dessin d'un <h3>", () => {
    const avecClasse = PERIMETRE.flatMap(f => (readFileSync(f, "utf8").match(/<h2[^>]*titre-carte[^>]*>/g) ?? []));
    // 39 depuis UX 6 : l'accueil locataire distingue le bail en préparation des actions d'un bail actif.
    // 42 depuis le 20/11/2026 : les trois titres de carte de /compte/donnees suivent la même règle (ils étaient des
    // <h2> en police d'affichage, sans la classe).
    // 43 depuis le 22/11/2026 : la carte « Signature électronique » de « Mes documents » du locataire (audit P1-06).
    // 44 depuis le 22/11/2026 : la carte « Nouveau message sur votre intervention » de « Mes demandes » (audit P1-05).
    // 45 depuis le 22/11/2026 : la carte « Rendez-vous du … manqué » de « Mes demandes » (audit P2-04).
    // 46 depuis le 24/11/2026 (lot 61, reprise M1) : la carte « Les données d'une location » de /compte/donnees, pour
    // l'ancien locataire et les comptes sans adhésion active de locataire.
    // 45 depuis le 24/11/2026 (lot D5, décision Q21) : la carte « Documents à signer » de « Mes documents » du
    // locataire (ancien parcours « télécharger, signer, redéposer ») est retirée.
    expect(avecClasse.length).toBe(45);
    const accueil = readFileSync("src/app/locataire/[orgId]/page.tsx", "utf8");
    // Mission 9 : l’état d’attente est un écran à part entière, avec son titre principal.
    expect(accueil).toMatch(/<h1>Votre bail n’est pas encore actif<\/h1>/);
    expect(accueil).toMatch(/<h1>Votre bail est terminé<\/h1>/);
    for (const titre of ["À faire en priorité", "Ce qui vous attend"])
      expect(accueil).toMatch(new RegExp(`<h2[^>]*titre-carte[^>]*>${titre}</h2>`));
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
