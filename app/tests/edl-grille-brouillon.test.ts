/**
 * D15 — le COMPORTEMENT de la grille d'état des lieux face à son brouillon local (RM-19.1.1, 19.1.6, 19.1.9), exécuté sur le
 * composant réel avec le moteur de hooks de tests/aide/hooks-sans-dom.ts (ni DOM ni navigateur) : les effets tournent, les
 * minuteurs sont simulés, le stockage est un faux localStorage.
 *
 * Relecture du 14/10 : cette section n'était qu'une suite d'expressions régulières sur le texte du source ; cinq mutations de la
 * grille survivaient (signature sans effacement, retour à zéro sans effacement, brouillon identique conservé, enAttente + 1,
 * écriture à zéro). Elles sont ici autant de tests.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => {
  const reel = await importOriginal<typeof import("react")>();
  const { hooks } = await import("./aide/hooks-sans-dom");
  return { ...reel, ...hooks, default: { ...reel, ...hooks } };
});
const { majGrilleEdl } = vi.hoisted(() => ({ majGrilleEdl: vi.fn() }));
vi.mock("@/app/actions/edl", () => ({ majGrilleEdl }));

import { GrilleEdl } from "@/app/agence/[orgId]/baux/[bailId]/edl/[edlId]/grille-edl";
import { cleAncienBrouillonEdl, cleBrouillonEdl, empreinteGrille, type BrouillonEdl } from "../src/lib/edl-brouillon";
import { monter, texte, trouver } from "./aide/hooks-sans-dom";

const LIGNES = [
  { id: "l1", categorie: "general", piece: "Séjour", libelle: "Murs", etat: "bon", commentaire: null },
  { id: "l2", categorie: "general", piece: "Séjour", libelle: "Sol", etat: null, commentaire: null },
  { id: "l3", categorie: "general", piece: "Cuisine", libelle: "Évier", etat: "usage", commentaire: "Rayé" },
];
const EMPREINTE = empreinteGrille(LIGNES);
const COMPTE = "compte-A";
const EDL = "edl-1";
const CLE = cleBrouillonEdl(COMPTE, EDL);
const CLE_ANCIENNE = cleAncienBrouillonEdl(EDL);
const MAINTENANT = new Date("2026-10-14T09:30:00.000Z");

function faux() {
  const m = new Map<string, string>();
  return {
    map: m,
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
  };
}

const brouillon = (suite: Partial<BrouillonEdl> = {}): BrouillonEdl => ({
  etats: { l1: "bon", l2: "mauvais", l3: "usage" },
  commentaires: { l1: "", l2: "Fuite", l3: "Rayé" },
  enregistreLe: "2026-10-13T18:00:00.000Z",
  empreinteServeur: EMPREINTE,
  enAttente: 2,
  ...suite,
});
const ancienBrouillon = (suite: Partial<BrouillonEdl> = {}): BrouillonEdl => {
  const { enAttente: _enAttente, ...ancien } = brouillon(suite);
  return ancien;
};
const lu = (cle: string) => JSON.parse(local.map.get(cle) ?? "null") as BrouillonEdl | null;

let local: ReturnType<typeof faux>;

function monterGrille(props: { signe?: boolean; compteId?: string } = {}) {
  const instance = monter(GrilleEdl, {
    orgId: "org-1", bailId: "bail-1", edlId: EDL, compteId: props.compteId ?? COMPTE, lignes: LIGNES, signe: props.signe ?? false,
  });
  instance.stabiliser();
  return instance;
}
type Instance = ReturnType<typeof monterGrille>;

const selectDe = (i: Instance, id: string) => trouver(i.rendu, (el) => el.type === "select" && el.props.name === `etat_${id}`)[0];
const commentaireDe = (i: Instance, id: string) => trouver(i.rendu, (el) => el.props.name === `commentaire_${id}`)[0];
const saisirEtat = (i: Instance, id: string, valeur: string) => {
  (selectDe(i, id).props.onChange as (e: unknown) => void)({ target: { value: valeur } });
  i.stabiliser();
};
const saisirCommentaire = (i: Instance, id: string, valeur: string) => {
  (commentaireDe(i, id).props.onChange as (e: unknown) => void)({ target: { value: valeur } });
  i.stabiliser();
};
const valeurEtat = (i: Instance, id: string) => selectDe(i, id).props.value;
const valeurCommentaire = (i: Instance, id: string) => commentaireDe(i, id).props.value;
const bouton = (i: Instance, libelle: string) => trouver(i.rendu, (el) => texte(el as never).includes(libelle) && typeof el.props.onClick === "function")[0];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
  local = faux();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), location: { reload: vi.fn() } });
  vi.stubGlobal("navigator", { onLine: true });
  majGrilleEdl.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("D15 — la grille à l'ouverture", () => {
  it("état des lieux signé : le brouillon du compte ET l'ancienne clé de cet état des lieux partent, rien d'autre", () => {
    local.setItem(CLE, JSON.stringify(brouillon()));
    local.setItem(CLE_ANCIENNE, JSON.stringify(ancienBrouillon()));
    local.setItem(cleBrouillonEdl(COMPTE, "autre-edl"), JSON.stringify(brouillon()));
    const grille = monterGrille({ signe: true });
    expect([...local.map.keys()]).toEqual([cleBrouillonEdl(COMPTE, "autre-edl")]);
    // Figé : aucune écriture ne repart, même après l'attente du minuteur.
    vi.advanceTimersByTime(2000);
    expect(local.map.has(CLE)).toBe(false);
    grille.demonter();
  });

  it("brouillon du compte dont l'empreinte est celle du serveur : la saisie est restaurée, le brouillon est conservé avec son nombre exact de lignes", async () => {
    local.setItem(CLE, JSON.stringify(brouillon({ enAttente: 99 })));
    const grille = monterGrille();
    await grille.vider();
    expect(valeurEtat(grille, "l2")).toBe("mauvais");
    expect(valeurCommentaire(grille, "l2")).toBe("Fuite");
    expect(valeurEtat(grille, "l1")).toBe("bon");
    // Après le délai d'écriture, le brouillon annonce les lignes qui diffèrent VRAIMENT de la version synchronisée (l2 : état et
    // commentaire = une ligne), pas le chiffre qu'il portait.
    vi.advanceTimersByTime(400);
    expect(lu(CLE)?.enAttente).toBe(1);
    expect(lu(CLE)?.etats.l2).toBe("mauvais");
    grille.demonter();
  });

  it("brouillon identique à la version synchronisée : il est effacé, la grille reste celle du serveur", async () => {
    local.setItem(CLE, JSON.stringify(brouillon({
      etats: { l1: "bon", l2: "", l3: "usage" }, commentaires: { l1: "", l2: "", l3: "Rayé" }, enAttente: 3,
    })));
    const grille = monterGrille();
    await grille.vider();
    expect(local.map.has(CLE)).toBe(false);
    expect(valeurEtat(grille, "l2")).toBe("");
    vi.advanceTimersByTime(2000);
    expect(local.map.has(CLE)).toBe(false);
    grille.demonter();
  });

  it("brouillon dont l'empreinte a changé (état des lieux modifié ailleurs) : signalé, jamais restauré ni effacé, la personne choisit", async () => {
    local.setItem(CLE, JSON.stringify(brouillon({ empreinteServeur: "autre-empreinte" })));
    const grille = monterGrille();
    await grille.vider();
    expect(texte(grille.rendu as never)).toContain("modifié depuis un autre appareil");
    expect(valeurEtat(grille, "l2")).toBe("");
    expect(lu(CLE)).not.toBeNull();

    // « Garder la version synchronisée » : le brouillon part.
    (bouton(grille, "Garder la version synchronisée").props.onClick as () => void)();
    grille.stabiliser();
    expect(local.map.has(CLE)).toBe(false);
    expect(texte(grille.rendu as never)).not.toContain("modifié depuis un autre appareil");
    grille.demonter();
  });

  it("brouillon en conflit, « Reprendre ma saisie locale » : la saisie revient et se réécrit avec l'empreinte du serveur", async () => {
    local.setItem(CLE, JSON.stringify(brouillon({ empreinteServeur: "autre-empreinte" })));
    const grille = monterGrille();
    await grille.vider();
    (bouton(grille, "Reprendre ma saisie locale").props.onClick as () => void)();
    grille.stabiliser();
    expect(valeurEtat(grille, "l2")).toBe("mauvais");
    vi.advanceTimersByTime(400);
    expect(lu(CLE)?.empreinteServeur).toBe(EMPREINTE);
    expect(lu(CLE)?.enAttente).toBe(1);
    grille.demonter();
  });

  it("sans brouillon : rien n'est lu ni écrit, même après le délai d'écriture", async () => {
    const grille = monterGrille();
    await grille.vider();
    vi.advanceTimersByTime(5000);
    expect(local.map.size).toBe(0);
    grille.demonter();
  });

  it("le brouillon d'un autre compte n'est jamais relu", async () => {
    local.setItem(cleBrouillonEdl("compte-B", EDL), JSON.stringify(brouillon()));
    const grille = monterGrille();
    await grille.vider();
    expect(valeurEtat(grille, "l2")).toBe("");
    expect([...local.map.keys()]).toEqual([cleBrouillonEdl("compte-B", EDL)]);
    grille.demonter();
  });
});

describe("D15 — l'ancienne clé (sans compte), saisie avant la mise à jour : la grille la reprend", () => {
  it("même empreinte : relevés restaurés, réécrits sous la clé du compte avec le nombre exact de lignes, ancienne clé retirée", async () => {
    local.setItem(CLE_ANCIENNE, JSON.stringify(ancienBrouillon()));
    local.setItem("gerimmo-edl-brouillon-edl-2", JSON.stringify(ancienBrouillon()));
    const grille = monterGrille();
    await grille.vider();
    expect(valeurEtat(grille, "l2")).toBe("mauvais");
    expect(valeurCommentaire(grille, "l2")).toBe("Fuite");
    // Dès la reprise, la clé du compte porte les relevés (« au moins une ligne ») ; l'ancienne clé de CET état des lieux est partie.
    expect(local.map.has(CLE_ANCIENNE)).toBe(false);
    expect(local.map.has("gerimmo-edl-brouillon-edl-2")).toBe(true);
    expect(lu(CLE)?.etats.l2).toBe("mauvais");
    expect((lu(CLE)?.enAttente ?? 0)).toBeGreaterThan(0);
    vi.advanceTimersByTime(400);
    expect(lu(CLE)?.enAttente).toBe(1);
    grille.demonter();
  });

  it("ancienne clé qui ne diffère plus du serveur : elle part, la grille reste celle du serveur", async () => {
    local.setItem(CLE_ANCIENNE, JSON.stringify(ancienBrouillon({
      etats: { l1: "bon", l2: "", l3: "usage" }, commentaires: { l1: "", l2: "", l3: "Rayé" },
    })));
    const grille = monterGrille();
    await grille.vider();
    expect([...local.map.keys()]).toEqual([]);
    expect(valeurEtat(grille, "l2")).toBe("");
    grille.demonter();
  });

  it("ancienne clé dont l'empreinte a changé : signalée comme un brouillon en conflit, relevés conservés tant que la personne n'a pas choisi", async () => {
    local.setItem(CLE_ANCIENNE, JSON.stringify(ancienBrouillon({ empreinteServeur: "autre-empreinte" })));
    const grille = monterGrille();
    await grille.vider();
    expect(texte(grille.rendu as never)).toContain("modifié depuis un autre appareil");
    expect(lu(CLE)?.etats.l2).toBe("mauvais");
    expect(local.map.has(CLE_ANCIENNE)).toBe(false);
    (bouton(grille, "Reprendre ma saisie locale").props.onClick as () => void)();
    grille.stabiliser();
    expect(valeurEtat(grille, "l2")).toBe("mauvais");
    grille.demonter();
  });
});

describe("D15 — la grille pendant la saisie", () => {
  it("une saisie n'écrit qu'après le délai, puis le brouillon annonce EXACTEMENT les lignes qui diffèrent du serveur", () => {
    const grille = monterGrille();
    saisirEtat(grille, "l1", "mauvais");
    expect(local.map.size).toBe(0);
    vi.advanceTimersByTime(399);
    expect(local.map.size).toBe(0);
    vi.advanceTimersByTime(1);
    const b = lu(CLE);
    expect(b?.enAttente).toBe(1);
    expect(b?.etats.l1).toBe("mauvais");
    expect(b?.empreinteServeur).toBe(EMPREINTE);
    // Horodaté à l'écriture (le temps simulé a avancé de 400 ms depuis la saisie).
    expect(b?.enregistreLe).toBe(new Date(MAINTENANT.getTime() + 400).toISOString());

    saisirCommentaire(grille, "l3", "Rayé et taché");
    vi.advanceTimersByTime(400);
    expect(lu(CLE)?.enAttente).toBe(2);
    // Une seconde modification de la même ligne ne compte pas deux fois.
    saisirEtat(grille, "l3", "mauvais");
    vi.advanceTimersByTime(400);
    expect(lu(CLE)?.enAttente).toBe(2);
    grille.demonter();
  });

  it("remise à l'identique de la version synchronisée : le brouillon disparaît (rien à perdre, donc rien à signaler à la déconnexion)", () => {
    const grille = monterGrille();
    saisirEtat(grille, "l1", "mauvais");
    vi.advanceTimersByTime(400);
    expect(lu(CLE)).not.toBeNull();
    saisirEtat(grille, "l1", "bon");
    expect(local.map.has(CLE)).toBe(false);
    vi.advanceTimersByTime(2000);
    expect(local.map.has(CLE)).toBe(false);
    grille.demonter();
  });

  it("zéro ligne différente : rien n'est écrit (jamais de brouillon à zéro)", () => {
    const grille = monterGrille();
    saisirEtat(grille, "l1", "bon");
    saisirCommentaire(grille, "l1", "");
    vi.advanceTimersByTime(5000);
    expect(local.map.size).toBe(0);
    grille.demonter();
  });

  it("un état des lieux signé n'écrit jamais, quelle que soit la saisie", () => {
    const grille = monterGrille({ signe: true });
    vi.advanceTimersByTime(5000);
    expect(local.map.size).toBe(0);
    grille.demonter();
  });

  it("l'envoi réussi efface le brouillon du compte et l'ancienne clé de cet état des lieux", async () => {
    vi.stubGlobal("FormData", class { get() { return null; } set() { /* sans objet */ } });
    vi.stubGlobal("HTMLButtonElement", class { /* jamais un bouton ici */ });
    majGrilleEdl.mockResolvedValue({ succes: true });
    const grille = monterGrille();
    saisirEtat(grille, "l1", "mauvais");
    vi.advanceTimersByTime(400);
    expect(lu(CLE)).not.toBeNull();
    local.setItem(CLE_ANCIENNE, JSON.stringify(ancienBrouillon()));

    const formulaire = trouver(grille.rendu as never, (el) => el.type === "form")[0];
    await (formulaire.props.onSubmit as (e: unknown) => Promise<void>)({
      preventDefault: () => undefined, nativeEvent: { submitter: null }, currentTarget: {},
    });
    await grille.vider();
    expect(majGrilleEdl).toHaveBeenCalledTimes(1);
    expect(local.map.has(CLE)).toBe(false);
    expect(local.map.has(CLE_ANCIENNE)).toBe(false);
    // Et la saisie envoyée est devenue la référence : plus rien n'est en attente, donc plus rien ne se réécrit.
    vi.advanceTimersByTime(2000);
    expect(local.map.size).toBe(0);
    grille.demonter();
  });

  it("l'envoi qui échoue laisse le brouillon en place", async () => {
    vi.stubGlobal("FormData", class { get() { return null; } set() { /* sans objet */ } });
    vi.stubGlobal("HTMLButtonElement", class { /* jamais un bouton ici */ });
    majGrilleEdl.mockResolvedValue({ erreur: "Refusé" });
    const grille = monterGrille();
    saisirEtat(grille, "l1", "mauvais");
    vi.advanceTimersByTime(400);
    const formulaire = trouver(grille.rendu as never, (el) => el.type === "form")[0];
    await (formulaire.props.onSubmit as (e: unknown) => Promise<void>)({
      preventDefault: () => undefined, nativeEvent: { submitter: null }, currentTarget: {},
    });
    await grille.vider();
    expect(lu(CLE)?.enAttente).toBe(1);
    grille.demonter();
  });
});
