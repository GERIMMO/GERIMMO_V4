/**
 * D15 / D14 — les deux composants qui déclenchent la purge des copies locales, exécutés pour de bon (moteur de hooks de
 * tests/aide/hooks-sans-dom.ts) :
 *   · PurgerCopiesALaDeconnexion (page de connexion) : purge seulement à l'arrivée par « ?raison=deconnecte », et n'affiche
 *     l'avertissement que s'il reste des relevés d'état des lieux non envoyés ;
 *   · PurgerCopiesAutresComptes (pages connectées) : copies d'un autre compte, copies périmées, brouillons d'état des lieux
 *     sans ligne non envoyée.
 *
 * Relecture du 14/10 : trois mutations survivaient (compteur mis à zéro, avertissement affiché à zéro, purge des brouillons
 * d'état des lieux neutralisée) parce que ces composants n'étaient vérifiés que par des expressions régulières sur le source.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

vi.mock("react", async (importOriginal) => {
  const reel = await importOriginal<typeof import("react")>();
  const { hooks } = await import("./aide/hooks-sans-dom");
  return { ...reel, ...hooks, default: { ...reel, ...hooks } };
});
const { parametres, purgerFichiers } = vi.hoisted(() => ({
  parametres: { courant: new URLSearchParams() },
  purgerFichiers: vi.fn(async () => undefined),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => parametres.courant }));
vi.mock("@/lib/brouillon-fichiers", () => ({ purgerCopiesFichiersObsoletes: purgerFichiers }));

import { AvertissementBrouillonsEdl, PurgerCopiesALaDeconnexion } from "../src/components/purger-copies-a-la-deconnexion";
import { PurgerCopiesAutresComptes } from "../src/components/purger-copies-autres-comptes";
import { cleAncienBrouillonEdl, cleBrouillonEdl, messageBrouillonsConserves } from "../src/lib/edl-brouillon";
import { cleDevisLocal } from "../src/lib/brouillon-devis-local";
import { monter, trouver } from "./aide/hooks-sans-dom";

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
const draft = (enAttente: number | undefined) =>
  JSON.stringify({ etats: { l1: "mauvais" }, commentaires: { l1: "Tache" }, enregistreLe: "2026-10-14T08:00:00.000Z", empreinteServeur: "abc", ...(enAttente === undefined ? {} : { enAttente }) });
const ancien = () => JSON.stringify({ etats: { l1: "mauvais" }, commentaires: { l1: "Tache" }, enregistreLe: "2026-10-10T08:00:00.000Z", empreinteServeur: "abc" });

let local: ReturnType<typeof faux>, session: ReturnType<typeof faux>, indexedDbSupprimees: string[];
beforeEach(() => {
  local = faux({
    [cleBrouillonEdl("A", "avec-relevés")]: draft(3),
    [cleBrouillonEdl("A", "a-zero")]: draft(0),
    [cleBrouillonEdl("A", "sans-compteur")]: draft(undefined),
    [cleAncienBrouillonEdl("ancien-avec-relevés")]: ancien(),
    [cleDevisLocal("B", "d1")]: "{}",
    theme: "sombre",
  });
  session = faux({ autre: "1" });
  indexedDbSupprimees = [];
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("indexedDB", { deleteDatabase: (n: string) => { indexedDbSupprimees.push(n); } });
  purgerFichiers.mockClear();
  parametres.courant = new URLSearchParams();
});
afterEach(() => vi.unstubAllGlobals());

describe("D15 — PurgerCopiesALaDeconnexion", () => {
  it("sans « raison=deconnecte » (session expirée, visite directe) : aucune copie n'est touchée et rien ne s'affiche", async () => {
    parametres.courant = new URLSearchParams("raison=expiree");
    const composant = monter(PurgerCopiesALaDeconnexion, {});
    composant.stabiliser();
    await composant.vider();
    expect(composant.rendu).toBeNull();
    expect(local.map.size).toBe(6);
    expect(indexedDbSupprimees).toEqual([]);
    composant.demonter();
  });

  it("après une déconnexion qui laisse des relevés : purge, puis avertissement avec le nombre exact de brouillons gardés et d'anciens", async () => {
    parametres.courant = new URLSearchParams("raison=deconnecte");
    const composant = monter(PurgerCopiesALaDeconnexion, {});
    composant.stabiliser();
    // Pendant l'hydratation, rien encore : l'avertissement vient après l'effet.
    expect(composant.rendu).toBeNull();
    await composant.vider();
    const avertissement = composant.rendu as { type: unknown; props: { nombre: number; anciens: number } };
    expect(avertissement.type).toBe(AvertissementBrouillonsEdl);
    expect(avertissement.props).toEqual({ nombre: 2, anciens: 1 });
    // La purge a eu lieu : le brouillon à zéro, celui sans compteur et la copie de devis sont partis, les deux avec relevés restent.
    expect([...local.map.keys()].sort()).toEqual(
      [cleBrouillonEdl("A", "avec-relevés"), cleAncienBrouillonEdl("ancien-avec-relevés"), "theme"].sort()
    );
    expect(indexedDbSupprimees).toEqual(["gerimmo-reprises"]);
    composant.demonter();
  });

  it("l'avertissement affiché dit la même chose que le message de la bibliothèque (singulier, pluriel, anciennes copies)", () => {
    const html = renderToStaticMarkup(createElement(AvertissementBrouillonsEdl, { nombre: 2, anciens: 1 }));
    expect(html).toContain(messageBrouillonsConserves(2, 1));
    expect(html).toMatch(/<p[^>]*role="status"/);
  });

  it("après une déconnexion sans relevé à garder : purge faite, aucun avertissement", async () => {
    local.map.clear();
    local.setItem(cleBrouillonEdl("A", "a-zero"), draft(0));
    local.setItem("theme", "sombre");
    parametres.courant = new URLSearchParams("raison=deconnecte");
    const composant = monter(PurgerCopiesALaDeconnexion, {});
    composant.stabiliser();
    await composant.vider();
    expect(composant.rendu).toBeNull();
    expect([...local.map.keys()]).toEqual(["theme"]);
    composant.demonter();
  });
});

describe("D15 — PurgerCopiesAutresComptes", () => {
  it("à l'arrivée sur une page connectée : brouillons sans relevé effacés, ceux qui en gardent conservés, copies des autres comptes effacées", async () => {
    const composant = monter(PurgerCopiesAutresComptes, { compteId: "A" });
    composant.stabiliser();
    await composant.vider();
    expect(composant.rendu).toBeNull();
    expect([...local.map.keys()].sort()).toEqual(
      [cleBrouillonEdl("A", "avec-relevés"), cleAncienBrouillonEdl("ancien-avec-relevés"), "theme"].sort()
    );
    expect(purgerFichiers).toHaveBeenCalledWith("A");
    composant.demonter();
  });

  it("efface aussi les copies de saisie du compte courant qui ont plus de 7 jours (D14), pas les récentes", async () => {
    const maintenant = Date.now();
    local.setItem(cleDevisLocal("A", "vieux"), JSON.stringify({ enregistreLe: maintenant - 8 * 24 * 3600 * 1000 }));
    local.setItem(cleDevisLocal("A", "recent"), JSON.stringify({ enregistreLe: maintenant - 6 * 24 * 3600 * 1000 }));
    const composant = monter(PurgerCopiesAutresComptes, { compteId: "A" });
    composant.stabiliser();
    expect(local.map.has(cleDevisLocal("A", "vieux"))).toBe(false);
    expect(local.map.has(cleDevisLocal("A", "recent"))).toBe(true);
    composant.demonter();
  });

  it("ne purge qu'une fois par compte : un nouveau rendu du même compte ne relance rien, un autre compte relance", async () => {
    const composant = monter(PurgerCopiesAutresComptes, { compteId: "A" });
    composant.stabiliser();
    expect(purgerFichiers).toHaveBeenCalledTimes(1);
    composant.stabiliser();
    expect(purgerFichiers).toHaveBeenCalledTimes(1);
    composant.avecProps({ compteId: "B" });
    expect(purgerFichiers).toHaveBeenCalledTimes(2);
    expect(purgerFichiers).toHaveBeenLastCalledWith("B");
    composant.demonter();
  });

  it("le composant ne rend rien", () => {
    const composant = monter(PurgerCopiesAutresComptes, { compteId: "A" });
    composant.stabiliser();
    expect(trouver(composant.rendu as never, () => true)).toEqual([]);
    composant.demonter();
  });
});
