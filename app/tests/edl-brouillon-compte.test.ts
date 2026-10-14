/**
 * D15 (fiches VER-SECURITE-01 partie état des lieux, VER-PR178-06 ; décision du dirigeant du 14/10/2026, option 2 avec
 * rattachement au compte) :
 *   - la clé du brouillon d'état des lieux porte le compte : le compte suivant sur le même appareil ne le relit pas ;
 *   - à la déconnexion, le brouillon est effacé s'il n'a aucune ligne non synchronisée ; sinon il est conservé et la personne
 *     est avertie qu'il en reste.
 *
 * D14 (fiches PR178-A-01, VER-PR178-02), option A : la durée de 7 jours des copies locales de saisie reste, avec la purge à la
 * déconnexion et à l'arrivée d'un autre compte (aucun changement de code ; ce fichier fige l'état vérifié).
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chargerBrouillon, cleBrouillonEdl, effacerBrouillon, messageBrouillonsConserves, PREFIXE_BROUILLON_EDL, purgerBrouillonsEdl,
  sauverBrouillon, type BrouillonEdl,
} from "../src/lib/edl-brouillon";
import {
  compteDeLaCle, DUREE_COPIES_LOCALES_MS, estCleDeCopie, purgerCopiesAutresComptes, purgerCopiesLocales, RAISON_DECONNEXION,
} from "../src/lib/copies-locales";
import { cleDevisLocal } from "../src/lib/brouillon-devis-local";

function faux(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    map: m,
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
  };
}

const brouillon = (enAttente?: number): BrouillonEdl => ({
  etats: { l1: "mauvais" }, commentaires: { l1: "Tache au plafond" }, enregistreLe: "2026-10-14T08:00:00.000Z", empreinteServeur: "abc",
  ...(enAttente === undefined ? {} : { enAttente }),
});
const LEGACY = "gerimmo-edl-brouillon-edl-1";

describe("D15 — la clé du brouillon est rattachée au compte", () => {
  let local: ReturnType<typeof faux>;
  beforeEach(() => { local = faux(); vi.stubGlobal("localStorage", local); });
  afterEach(() => vi.unstubAllGlobals());

  it("la clé porte le compte et l'état des lieux, et ne ressemble ni à l'ancienne clé ni à une copie « gerimmo: »", () => {
    const cle = cleBrouillonEdl("compte A", "edl/1");
    expect(cle).toBe("gerimmo-edl-brouillon:compte%20A:edl%2F1");
    expect(cle.startsWith(PREFIXE_BROUILLON_EDL)).toBe(true);
    expect(cle).not.toBe(`gerimmo-edl-brouillon-edl-1`);
    // La purge aveugle des autres copies de saisie ne la voit pas : elle ne détruit jamais des relevés non envoyés.
    expect(estCleDeCopie(cle)).toBe(false);
    expect(compteDeLaCle(cle)).toBeNull();
  });

  it("le compte qui a écrit le brouillon le relit ; un autre compte du même appareil n'en voit rien", () => {
    sauverBrouillon("A", "edl-1", brouillon(2));
    expect(chargerBrouillon("A", "edl-1")?.commentaires.l1).toBe("Tache au plafond");
    expect(chargerBrouillon("B", "edl-1")).toBeNull();
    expect([...local.map.keys()]).toEqual([cleBrouillonEdl("A", "edl-1")]);
  });

  it("l'ancienne clé, sans compte, n'est plus jamais lue", () => {
    local.setItem(LEGACY, JSON.stringify(brouillon(3)));
    expect(chargerBrouillon("A", "edl-1")).toBeNull();
    expect(chargerBrouillon("B", "edl-1")).toBeNull();
  });

  it("sans compte, rien ne s'écrit ni ne se lit : un brouillon ne se rattache à personne", () => {
    sauverBrouillon("", "edl-1", brouillon(1));
    expect(local.map.size).toBe(0);
    local.setItem(cleBrouillonEdl("", "edl-1"), JSON.stringify(brouillon(1)));
    expect(chargerBrouillon("", "edl-1")).toBeNull();
  });

  it("effacerBrouillon ne retire que le brouillon du compte demandé", () => {
    sauverBrouillon("A", "edl-1", brouillon(1)); sauverBrouillon("B", "edl-1", brouillon(1));
    effacerBrouillon("A", "edl-1");
    expect(chargerBrouillon("A", "edl-1")).toBeNull();
    expect(chargerBrouillon("B", "edl-1")).not.toBeNull();
  });

  it("un stockage refusé ne fait jamais lever d'erreur", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("refusé"); }, setItem: () => { throw new Error("plein"); }, removeItem: () => { throw new Error("refusé"); } });
    expect(chargerBrouillon("A", "e")).toBeNull();
    expect(() => sauverBrouillon("A", "e", brouillon(1))).not.toThrow();
    expect(() => effacerBrouillon("A", "e")).not.toThrow();
  });
});

describe("D15 — purge à la déconnexion : effacé sans ligne non synchronisée, conservé et signalé sinon", () => {
  let local: ReturnType<typeof faux>, session: ReturnType<typeof faux>, supprimees: string[];
  beforeEach(() => {
    local = faux({
      [cleBrouillonEdl("A", "avec-relevés")]: JSON.stringify(brouillon(4)),
      [cleBrouillonEdl("A", "a-zero")]: JSON.stringify(brouillon(0)),
      [cleBrouillonEdl("A", "sans-compteur")]: JSON.stringify(brouillon()),
      [cleBrouillonEdl("B", "illisible")]: "pas du json",
      [cleBrouillonEdl("B", "autre-compte-avec-relevés")]: JSON.stringify(brouillon(1)),
      [LEGACY]: JSON.stringify(brouillon(5)),
      [cleDevisLocal("A", "d1")]: "{}",
      theme: "sombre",
    });
    session = faux({ autre: "1" });
    supprimees = [];
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);
    vi.stubGlobal("indexedDB", { deleteDatabase: (n: string) => { supprimees.push(n); } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("purgerBrouillonsEdl : garde seulement ce qui annonce des lignes non envoyées, efface le reste dont l'ancienne clé, ne touche à rien d'autre", () => {
    const bilan = purgerBrouillonsEdl();
    // Effacés : « a-zero », « sans-compteur », « illisible » et l'ancienne clé sans compte. Gardés : les deux qui annoncent des relevés.
    expect(bilan).toEqual({ efface: 4, conserves: 2 });
    expect([...local.map.keys()].sort()).toEqual([
      cleBrouillonEdl("A", "avec-relevés"), cleBrouillonEdl("B", "autre-compte-avec-relevés"), cleDevisLocal("A", "d1"), "theme",
    ].sort());
  });

  it("la déconnexion (purgerCopiesLocales) applique cette règle en plus de la purge des autres copies, et rend le nombre de brouillons gardés", () => {
    const bilan = purgerCopiesLocales();
    expect(bilan.conserves).toBe(2);
    expect([...local.map.keys()].sort()).toEqual([cleBrouillonEdl("A", "avec-relevés"), cleBrouillonEdl("B", "autre-compte-avec-relevés"), "theme"].sort());
    expect(supprimees).toEqual(["gerimmo-reprises"]);
  });

  it("sans brouillon à garder, la déconnexion rend zéro : aucun avertissement", () => {
    local.map.clear(); local.setItem("theme", "sombre");
    expect(purgerCopiesLocales()).toEqual({ efface: 0, conserves: 0 });
  });

  it("un compte qui arrive efface les copies des autres comptes, mais pas leurs brouillons d'état des lieux non envoyés", () => {
    purgerCopiesAutresComptes("B");
    expect(local.map.has(cleBrouillonEdl("A", "avec-relevés"))).toBe(true);
    expect(local.map.has(cleDevisLocal("A", "d1"))).toBe(false);
  });

  it("ne lève jamais d'erreur si le stockage est refusé", () => {
    vi.stubGlobal("localStorage", { get length(): number { throw new Error("refusé"); } });
    vi.stubGlobal("sessionStorage", undefined);
    expect(purgerBrouillonsEdl()).toEqual({ efface: 0, conserves: 0 });
    expect(() => purgerCopiesLocales()).not.toThrow();
    vi.stubGlobal("localStorage", undefined);
    expect(purgerBrouillonsEdl()).toEqual({ efface: 0, conserves: 0 });
  });
});

describe("D15 — l'avertissement de déconnexion", () => {
  it("dit au singulier et au pluriel ce qui reste sur l'appareil et que la reconnexion permet de l'envoyer", () => {
    expect(messageBrouillonsConserves(1)).toBe("Vous êtes déconnecté. Un état des lieux contient des relevés qui n’ont pas été envoyés : ils restent sur cet appareil et ne sont repris que depuis votre compte. Reconnectez-vous pour les envoyer ; sur un appareil partagé, faites-le avant de le quitter.");
    expect(messageBrouillonsConserves(3)).toContain("3 états des lieux contiennent des relevés qui n’ont pas été envoyés");
  });

  it("s'affiche comme un statut lisible, au composant près : pas de code, pas de jargon", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
    const { AvertissementBrouillonsEdl } = await import("../src/components/purger-copies-a-la-deconnexion");
    vi.doUnmock("next/navigation");
    const html = renderToStaticMarkup(createElement(AvertissementBrouillonsEdl, { nombre: 2 }));
    expect(html).toMatch(/<p[^>]*role="status"/);
    expect(html).toContain("2 états des lieux contiennent des relevés");
    expect(html).not.toMatch(/localStorage|brouillon|enAttente|undefined/);
  });

  it("la page de connexion pose le composant, qui purge à l'arrivée sur la raison « deconnecte » et affiche l'avertissement", () => {
    const composant = readFileSync("src/components/purger-copies-a-la-deconnexion.tsx", "utf8");
    expect(composant).toMatch(/raison !== RAISON_DECONNEXION\) return/);
    expect(composant).toMatch(/const \{ conserves \} = purgerCopiesLocales\(\)/);
    expect(composant).toMatch(/<AvertissementBrouillonsEdl nombre=\{brouillonsConserves\} \/>/);
    expect(readFileSync("src/app/connexion/page.tsx", "utf8")).toMatch(/<PurgerCopiesALaDeconnexion \/>/);
  });
});

describe("D15 — branchement dans l'application", () => {
  const grille = readFileSync("src/app/agence/[orgId]/baux/[bailId]/edl/[edlId]/grille-edl.tsx", "utf8");
  it("la grille lit, écrit et efface le brouillon du compte courant, et annonce les lignes non envoyées", () => {
    expect(grille).toMatch(/compteId: string;/);
    expect(grille).toMatch(/chargerBrouillon\(compteId, edlId\)/);
    expect(grille).toMatch(/sauverBrouillon\(compteId, edlId, \{[^}]*enAttente: attente/);
    expect(grille).not.toMatch(/chargerBrouillon\(edlId\)|sauverBrouillon\(edlId|effacerBrouillon\(edlId\)/);
  });
  it("la page de l'état des lieux donne à la grille l'identifiant du compte connecté", () => {
    expect(readFileSync("src/app/agence/[orgId]/baux/[bailId]/edl/[edlId]/page.tsx", "utf8")).toMatch(/compteId=\{user\.id\}/);
  });
  it("l'arrivée sur une page connectée efface l'ancienne clé et les brouillons sans ligne non envoyée", () => {
    expect(readFileSync("src/components/purger-copies-autres-comptes.tsx", "utf8")).toMatch(/purgerBrouillonsEdl\(\)/);
  });
});

describe("D14 — durée de 7 jours des copies locales, purge à la déconnexion et au changement de compte (état vérifié, aucun changement)", () => {
  it("DUREE_COPIES_LOCALES_MS vaut exactement 7 jours", () => {
    expect(DUREE_COPIES_LOCALES_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
  it("la déconnexion réussie mène à /connexion?raison=deconnecte, où la purge part", () => {
    expect(RAISON_DECONNEXION).toBe("deconnecte");
    expect(readFileSync("src/app/actions/auth.ts", "utf8")).toMatch(/redirect\(`\/connexion\?raison=\$\{RAISON_DECONNEXION\}`\)/);
    expect(readFileSync("src/components/purger-copies-a-la-deconnexion.tsx", "utf8")).toMatch(/purgerCopiesLocales\(\)/);
  });
  it("l'arrivée d'un autre compte purge les copies des autres comptes et les copies périmées, dans le menu du compte et les pages à en-tête propre", () => {
    const composant = readFileSync("src/components/purger-copies-autres-comptes.tsx", "utf8");
    expect(composant).toMatch(/purgerCopiesAutresComptes\(compteId\)/);
    expect(composant).toMatch(/purgerCopiesPerimees\(\)/);
    for (const f of ["src/components/menu-compte.tsx", "src/app/compte/page.tsx", "src/app/securite/page.tsx", "src/app/espaces/page.tsx"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/<PurgerCopiesAutresComptes /);
    }
  });
  it("l'écran annonce la même durée que la constante", () => {
    expect(readFileSync("src/components/reprise-locale/index.tsx", "utf8")).toMatch(/après 7 jours/);
  });
});
