import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clicQuitteLaPage, MESSAGE_QUITTER } from "../src/lib/protection-saisie";
import { installerGardeCopieLocale, saisieSansCopie, type StatutCopie } from "../src/lib/garde-copie-locale";

/**
 * VFL-03 (vérification finale, 14/10) : quand la copie locale est refusée (stockage bloqué) ou en conflit, la saisie de la
 * fiche personne n'existe plus qu'à l'écran. L'alerte dit « Gardez cet onglet ouvert », mais un lien interne (Next Link) la
 * perdait sans avertissement : `protection-saisie.ts` exclut les formulaires `data-protection-saisie="locale"` de son garde
 * de liens, et le hook de la copie n'écoutait que `beforeunload`, que la navigation côté client ne déclenche pas.
 *
 * Pas d'environnement DOM sous vitest : window, document, Element et location sont de petits faux.
 */

const PAGE = "http://127.0.0.1:3100/agence/org/personnes";

describe("clicQuitteLaPage : quel clic sur un lien quitte vraiment la page", () => {
  const simple = { defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  const lien = (href: string, extra: Partial<{ target: string; download: boolean }> = {}) => ({ href, target: "", download: false, ...extra });

  it("un lien interne ou externe, clic simple, même onglet : oui", () => {
    expect(clicQuitteLaPage(simple, lien("http://127.0.0.1:3100/agence/org/parc"), PAGE)).toBe(true);
    expect(clicQuitteLaPage(simple, lien("https://exemple.fr/"), PAGE)).toBe(true);
    expect(clicQuitteLaPage(simple, lien(PAGE, { target: "_self" }), PAGE)).toBe(true);
  });
  it("un simple changement de fragment sur la même page : non", () => {
    expect(clicQuitteLaPage(simple, lien(`${PAGE}#creer-fiche`), PAGE)).toBe(false);
    // …mais la même adresse sans fragment recharge la page, et un autre chemin avec fragment la quitte.
    expect(clicQuitteLaPage(simple, lien(PAGE), PAGE)).toBe(true);
    expect(clicQuitteLaPage(simple, lien("http://127.0.0.1:3100/agence/org/parc#x"), PAGE)).toBe(true);
    expect(clicQuitteLaPage(simple, lien(`${PAGE}?q=1#x`), PAGE)).toBe(true);
  });
  it("nouvel onglet, téléchargement, touche modificatrice, autre bouton, geste déjà annulé, schéma non web : non", () => {
    const ailleurs = "http://127.0.0.1:3100/agence/org/parc";
    expect(clicQuitteLaPage(simple, lien(ailleurs, { target: "_blank" }), PAGE)).toBe(false);
    expect(clicQuitteLaPage(simple, lien(ailleurs, { download: true }), PAGE)).toBe(false);
    for (const touche of ["metaKey", "ctrlKey", "shiftKey", "altKey"]) expect(clicQuitteLaPage({ ...simple, [touche]: true }, lien(ailleurs), PAGE)).toBe(false);
    expect(clicQuitteLaPage({ ...simple, button: 1 }, lien(ailleurs), PAGE)).toBe(false);
    expect(clicQuitteLaPage({ ...simple, defaultPrevented: true }, lien(ailleurs), PAGE)).toBe(false);
    expect(clicQuitteLaPage(simple, lien("mailto:a@b.fr"), PAGE)).toBe(false);
    expect(clicQuitteLaPage(simple, lien("tel:+33100000000"), PAGE)).toBe(false);
  });
});

describe("saisieSansCopie : seuls un refus et un conflit laissent la saisie à l'écran seul", () => {
  it.each<[StatutCopie, boolean]>([["refuse", true], ["conflit", true], ["vide", false], ["attente", false], ["conserve", false]])(
    "%s → %s", (statut, attendu) => expect(saisieSansCopie(statut)).toBe(attendu));
});

describe("installerGardeCopieLocale : la navigation interne est confirmée tant que la copie manque", () => {
  type Ecouteur = (event: never) => void;
  let ecouteurs: Record<"window" | "document" | "navigation", Map<string, Ecouteur>>;
  let confirmer: ReturnType<typeof vi.fn>;

  class FauxElement {
    constructor(private readonly lien: { href: string; target: string; hasAttribute: (n: string) => boolean } | null) {}
    closest(selecteur: string) { return selecteur === "a[href]" ? this.lien : null; }
  }
  const lienVers = (href: string, extra: { target?: string; download?: boolean } = {}) =>
    new FauxElement({ href, target: extra.target ?? "", hasAttribute: n => n === "download" && !!extra.download });
  function clic(cible: FauxElement, extra: Record<string, unknown> = {}) {
    const event = { target: cible, defaultPrevented: false, button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false,
      preventDefault: vi.fn(), stopPropagation: vi.fn(), stopImmediatePropagation: vi.fn(), ...extra };
    (ecouteurs.document.get("click") as ((e: typeof event) => void) | undefined)?.(event);
    return event;
  }
  function avantSortie() {
    const event = { preventDefault: vi.fn(), returnValue: undefined as unknown };
    (ecouteurs.window.get("beforeunload") as ((e: typeof event) => void) | undefined)?.(event);
    return event;
  }
  const faux = (nom: "window" | "document" | "navigation") => ({
    addEventListener: (type: string, f: Ecouteur) => { ecouteurs[nom].set(type, f); },
    removeEventListener: (type: string, f: Ecouteur) => { if (ecouteurs[nom].get(type) === f) ecouteurs[nom].delete(type); },
  });

  beforeEach(() => {
    vi.useFakeTimers();
    ecouteurs = { window: new Map(), document: new Map(), navigation: new Map() };
    confirmer = vi.fn();
    vi.stubGlobal("Element", FauxElement);
    vi.stubGlobal("location", { href: PAGE });
    vi.stubGlobal("window", { ...faux("window"), confirm: confirmer, navigation: faux("navigation") });
    vi.stubGlobal("document", faux("document"));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it.each<StatutCopie>(["refuse", "conflit"])("%s : un lien interne demande confirmation, avec le message de la boîte « quitter la page »", statut => {
    installerGardeCopieLocale(statut);
    confirmer.mockReturnValue(false);
    const event = clic(lienVers("http://127.0.0.1:3100/agence/org/parc"));
    expect(confirmer).toHaveBeenCalledTimes(1);
    expect(confirmer).toHaveBeenCalledWith(MESSAGE_QUITTER);
    // « Rester » : le Link de Next ne reçoit jamais le clic.
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopImmediatePropagation).toHaveBeenCalled();
  });

  it("« Quitter » laisse passer la navigation, sans second avertissement du navigateur pendant qu'elle se fait", () => {
    installerGardeCopieLocale("refuse");
    confirmer.mockReturnValue(true);
    const event = clic(lienVers("http://127.0.0.1:3100/agence/org/parc"));
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(avantSortie().preventDefault).not.toHaveBeenCalled(); // lien hors Next : un seul message
    vi.advanceTimersByTime(1600);
    expect(avantSortie().preventDefault).toHaveBeenCalled(); // la fenêtre de grâce est refermée
  });

  it.each<[string, FauxElement, Record<string, unknown>?]>([
    ["un changement de fragment sur la page", lienVers(`${PAGE}#creer-fiche`)],
    ["un lien ouvert dans un autre onglet", lienVers("http://127.0.0.1:3100/agence/org/parc", { target: "_blank" })],
    ["un téléchargement", lienVers("http://127.0.0.1:3100/doc.pdf", { download: true })],
    ["un clic avec Ctrl", lienVers("http://127.0.0.1:3100/agence/org/parc"), { ctrlKey: true }],
    ["un mailto:", lienVers("mailto:a@b.fr")],
    ["un clic hors de tout lien", new FauxElement(null)],
  ])("refuse : %s ne demande rien", (_nom, cible, extra) => {
    installerGardeCopieLocale("refuse");
    clic(cible, extra);
    expect(confirmer).not.toHaveBeenCalled();
  });

  it.each<StatutCopie>(["conserve", "vide"])("%s : rien n'est écouté, le démontage a déjà écrit la copie", statut => {
    installerGardeCopieLocale(statut);
    expect(ecouteurs.document.size).toBe(0);
    expect(ecouteurs.window.size).toBe(0);
    clic(lienVers("http://127.0.0.1:3100/agence/org/parc"));
    expect(confirmer).not.toHaveBeenCalled();
  });

  it("attente : aucune confirmation de lien (le démontage écrit la copie) mais la fermeture d'onglet reste gardée", () => {
    installerGardeCopieLocale("attente");
    const event = clic(lienVers("http://127.0.0.1:3100/agence/org/parc"));
    expect(confirmer).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(avantSortie().preventDefault).toHaveBeenCalled();
  });

  it("refuse et conflit gardent aussi la fermeture d'onglet (comportement antérieur conservé)", () => {
    for (const statut of ["refuse", "conflit"] as const) {
      installerGardeCopieLocale(statut);
      const e = avantSortie();
      expect(e.preventDefault).toHaveBeenCalled();
      expect(e.returnValue).toBe("");
    }
  });

  function retour(extra: Record<string, unknown> = {}) {
    const event = { navigationType: "traverse", canIntercept: true, hashChange: false, preventDefault: vi.fn(), ...extra };
    (ecouteurs.navigation.get("navigate") as ((e: typeof event) => void) | undefined)?.(event);
    return event;
  }

  it("refuse : le retour arrière du navigateur demande la même confirmation, et « Rester » l'annule", () => {
    installerGardeCopieLocale("refuse");
    confirmer.mockReturnValueOnce(false);
    const event = retour();
    expect(confirmer).toHaveBeenCalledWith(MESSAGE_QUITTER);
    expect(event.preventDefault).toHaveBeenCalled();
    confirmer.mockReturnValueOnce(true);
    expect(retour().preventDefault).not.toHaveBeenCalled();
  });

  it.each<Record<string, unknown>>([{ navigationType: "push" }, { canIntercept: false }, { hashChange: true }])(
    "refuse : une navigation qui n'est pas un retour interne ne demande rien (%o)", extra => {
      installerGardeCopieLocale("refuse");
      retour(extra);
      expect(confirmer).not.toHaveBeenCalled();
    });

  it.each<StatutCopie>(["attente", "conserve", "vide"])("%s : le retour arrière ne demande rien", statut => {
    installerGardeCopieLocale(statut);
    retour();
    expect(confirmer).not.toHaveBeenCalled();
  });

  it("le nettoyage retire les écouteurs : une fois le statut changé, plus aucune confirmation", () => {
    const retirer = installerGardeCopieLocale("refuse");
    retirer();
    expect(ecouteurs.document.size).toBe(0);
    expect(ecouteurs.window.size).toBe(0);
    expect(ecouteurs.navigation.size).toBe(0);
    clic(lienVers("http://127.0.0.1:3100/agence/org/parc"));
    expect(confirmer).not.toHaveBeenCalled();
  });
});

describe("branchement dans le hook de la copie", () => {
  it("useCopieFichiers passe par installerGardeCopieLocale (plus de beforeunload local)", () => {
    const source = readFileSync("src/components/reprise-locale/index.tsx", "utf8");
    expect(source).toMatch(/installerGardeCopieLocale\(statut\)/);
    expect(source).not.toMatch(/addEventListener\("beforeunload"/);
  });
});
