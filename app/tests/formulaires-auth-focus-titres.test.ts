/**
 * Relevé du designer du 13/10/2026 (DES-A-12) : après une erreur de formulaire d'authentification, le focus
 * retombait sur <body>. L'alerte (`role="alert"`) reçoit maintenant le focus (`tabIndex={-1}`).
 *
 * Le focus lui-même se prouve au navigateur (rapport du correcteur) ; ce fichier garde ce qui se teste sans DOM :
 * l'alerte est bien focalisable par le code, et les quatre formulaires l'utilisent. Les titres des pages
 * d'authentification restent distincts les uns des autres.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AlerteFormulaire } from "../src/components/alerte-formulaire";

const lire = (chemin: string) => readFileSync(resolve(__dirname, "..", chemin), "utf8");

describe("AlerteFormulaire", () => {
  const html = renderToStaticMarkup(createElement(AlerteFormulaire, null, "Identifiants invalides."));

  it("est annoncée (role=alert) et focalisable par le code (tabindex=-1), sans entrer dans l'ordre de Tab", () => {
    expect(html).toContain('role="alert"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("Identifiants invalides.");
  });

  it("garde le style d'erreur des formulaires, ou celui qu'on lui donne", () => {
    expect(html).toContain('class="text-sm text-destructive"');
    expect(renderToStaticMarkup(createElement(AlerteFormulaire, { className: "x" }, "m"))).toContain('class="x"');
  });
});

describe("les formulaires d'authentification utilisent l'alerte focalisée", () => {
  it.each([
    ["src/app/connexion/formulaire-connexion.tsx", "<AlerteFormulaire>{erreur}</AlerteFormulaire>"],
    ["src/app/inscription/formulaire-inscription.tsx", "<AlerteFormulaire signal={etat}>{etat.erreur}</AlerteFormulaire>"],
    ["src/app/mot-de-passe-oublie/formulaire-reinitialisation.tsx", "<AlerteFormulaire signal={etat}>{etat.erreur}</AlerteFormulaire>"],
    ["src/app/nouveau-mot-de-passe/formulaire-nouveau-mot-de-passe.tsx", "<AlerteFormulaire signal={etat}>{etat.erreur}</AlerteFormulaire>"],
  ])("%s", (fichier, attendu) => {
    const source = lire(fichier);
    expect(source).toContain(attendu);
    // plus de <p role="alert"> écrit à la main : il ne recevrait pas le focus
    expect(source).not.toMatch(/<p[^>]*role="alert"/);
  });
});

describe("titres des pages d'authentification", () => {
  const PAGES = [
    "src/app/connexion/page.tsx",
    "src/app/inscription/page.tsx",
    "src/app/mot-de-passe-oublie/page.tsx",
    "src/app/nouveau-mot-de-passe/page.tsx",
    "src/app/artisan/inscription/page.tsx",
    "src/app/auth/confirmer/page.tsx",
  ];
  const titre = (chemin: string) => /(?:title|titre):\s*"([^"]+)"/.exec(lire(chemin))?.[1];

  it("la page « nouveau mot de passe » a son propre titre", () => {
    expect(titre("src/app/nouveau-mot-de-passe/page.tsx")).toBe("Nouveau mot de passe — Gerimmo");
  });

  it("deux pages d'authentification ne partagent pas le même titre", () => {
    const titres = PAGES.map(titre).filter((t): t is string => Boolean(t));
    expect(titres).toHaveLength(PAGES.length);
    expect(new Set(titres).size).toBe(titres.length);
  });
});
