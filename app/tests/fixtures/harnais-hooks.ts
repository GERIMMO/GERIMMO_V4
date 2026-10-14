/**
 * Banc minimal pour exercer un composant client SANS navigateur (ni jsdom, ni testing-library : aucun n'est installé).
 *
 * Le rendu serveur (`renderToStaticMarkup`) ne joue jamais les effets ni les changements d'état : il ne dit rien d'un champ qui se
 * remplit après un appel, ni d'un avertissement qui apparaît quand on change une valeur. Ce banc fait tourner le composant lui-même,
 * fois après fois, avec de vrais `useState` / `useEffect` simulés :
 *   · l'état survit d'un rendu à l'autre, un changement d'état provoque un nouveau rendu ;
 *   · un effet se rejoue quand ses dépendances changent, et son nettoyage passe avant le suivant (comme React) ;
 *   · l'arbre rendu est lu tel quel : `saisir()` appelle le `onChange` de l'élément visé, `html()` le met en forme.
 *
 * Ce que le banc ne prouve PAS : le comportement exact de React dans un vrai navigateur (ordre fin des effets, mode strict, transitions).
 * Il prouve que le BRANCHEMENT du composant est juste : quel appel part, avec quels arguments, ce que devient la réponse, ce que
 * deviennent deux réponses qui se croisent.
 *
 * Usage (dans le fichier de test, avant les imports du composant) :
 *   vi.mock("react", async (original) => (await import("./fixtures/harnais-hooks")).reactAvecHooksSimules(await original<typeof import("react")>()));
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement, ReactNode } from "react";

type Racine = typeof import("react");
type Nettoyage = void | (() => void);
type Effet = { deps: readonly unknown[] | undefined; nettoyage: Nettoyage };

// Ce que les hooks lisent et écrivent : séparé de `Instance<P>` pour que `courante` n'ait pas à connaître le type des props.
class Etat {
  etats: unknown[] = [];
  refs: { current: unknown }[] = [];
  memos: { deps: readonly unknown[] | undefined; valeur: unknown }[] = [];
  effets: Effet[] = [];
  aExecuter: { rang: number; fn: () => Nettoyage; deps: readonly unknown[] | undefined }[] = [];
  compteurs = { etat: 0, ref: 0, memo: 0, effet: 0, id: 0 };
  sale = false;
  constructor(readonly numero: number) {}
}

class Instance<P> extends Etat {
  rendus = 0;
  arbre: ReactNode = null;
  constructor(readonly composant: (props: P) => ReactNode, readonly props: P, numero: number) {
    super(numero);
  }

  rendre() {
    this.compteurs = { etat: 0, ref: 0, memo: 0, effet: 0, id: 0 };
    this.aExecuter = [];
    this.sale = false;
    activer(this);
    try {
      this.arbre = this.composant(this.props);
    } finally {
      activer(null);
    }
    this.rendus++;
    // « Commit » : les effets dont les dépendances ont changé se rejouent, nettoyage du précédent d'abord.
    for (const e of this.aExecuter) {
      const precedent = this.effets[e.rang];
      const change = !precedent || !e.deps || !precedent.deps || e.deps.length !== precedent.deps.length || e.deps.some((d, i) => !Object.is(d, precedent.deps![i]));
      if (!change) continue;
      if (precedent && typeof precedent.nettoyage === "function") precedent.nettoyage();
      this.effets[e.rang] = { deps: e.deps, nettoyage: e.fn() };
    }
  }
}

let courante: Etat | null = null;
const activer = (etat: Etat | null) => {
  courante = etat;
};
let instances = 0;

const memeDeps = (a: readonly unknown[] | undefined, b: readonly unknown[] | undefined) =>
  !!a && !!b && a.length === b.length && a.every((d, i) => Object.is(d, b[i]));

/** Remplace les hooks de React par des versions qui tournent dans le banc, et laisse les vrais partout ailleurs (rendu serveur imbriqué). */
export function reactAvecHooksSimules(react: Racine): Racine {
  const useState = ((initial: unknown) => {
    const inst = courante;
    if (!inst) return react.useState(initial as never);
    const i = inst.compteurs.etat++;
    if (!(i in inst.etats)) inst.etats[i] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    const poser = (v: unknown) => {
      const precedent = inst.etats[i];
      const suivant = typeof v === "function" ? (v as (p: unknown) => unknown)(precedent) : v;
      if (Object.is(precedent, suivant)) return;
      inst.etats[i] = suivant;
      inst.sale = true;
    };
    return [inst.etats[i], poser];
  }) as unknown as Racine["useState"];
  const useEffect = ((fn: () => Nettoyage, deps?: readonly unknown[]) => {
    const inst = courante;
    if (!inst) return react.useEffect(fn as never, deps as never);
    inst.aExecuter.push({ rang: inst.compteurs.effet++, fn, deps });
  }) as unknown as Racine["useEffect"];
  const useRef = ((initial: unknown) => {
    const inst = courante;
    if (!inst) return react.useRef(initial as never);
    const i = inst.compteurs.ref++;
    return (inst.refs[i] ??= { current: initial });
  }) as unknown as Racine["useRef"];
  const memoiser = (fn: () => unknown, deps?: readonly unknown[]) => {
    const inst = courante;
    if (!inst) return react.useMemo(fn, deps as never);
    const i = inst.compteurs.memo++;
    const m = inst.memos[i];
    if (m && memeDeps(m.deps, deps)) return m.valeur;
    return (inst.memos[i] = { deps, valeur: fn() }).valeur;
  };
  const useMemo = memoiser as unknown as Racine["useMemo"];
  const useCallback = ((fn: unknown, deps?: readonly unknown[]) => memoiser(() => fn, deps)) as unknown as Racine["useCallback"];
  const useId = (() => {
    const inst = courante;
    if (!inst) return react.useId();
    return `:banc${inst.numero}-${inst.compteurs.id++}:`;
  }) as Racine["useId"];
  return { ...react, useState, useEffect, useLayoutEffect: useEffect, useRef, useMemo, useCallback, useId };
}

export type Noeud = { type: unknown; props: Record<string, unknown> };
const estElement = (n: unknown): n is Noeud => typeof n === "object" && n !== null && "type" in n && "props" in n;

/** Tous les éléments de l'arbre, parents avant enfants. */
export function parcourir(noeud: unknown, visiteur: (n: Noeud) => void): void {
  if (Array.isArray(noeud)) return noeud.forEach((n) => parcourir(n, visiteur));
  if (!estElement(noeud)) return;
  visiteur(noeud);
  parcourir(noeud.props.children, visiteur);
}

export type Monte = {
  /** Nombre de rendus du composant depuis le montage. */
  rendus(): number;
  html(): string;
  texte(): string;
  /** Le champ nommé (input, select, textarea, ou composant qui en porte le nom) dans l'arbre actuel. */
  champ(nom: string): Noeud | undefined;
  /** Tape / choisit une valeur : appelle le `onChange` du champ, puis laisse passer les effets et les réponses en attente. */
  saisir(nom: string, valeur: string): Promise<void>;
  /** Laisse passer les promesses résolues et rejoue le composant tant qu'un état a changé. */
  stabiliser(): Promise<void>;
};

const HOTES = new Set(["input", "select", "textarea"]);
const attendre = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function monter<P>(composant: (props: P) => ReactNode, props: P): Monte {
  const inst = new Instance<P>(composant, props, ++instances);
  inst.rendre();
  const champ = (nom: string) => {
    let trouve: Noeud | undefined;
    parcourir(inst.arbre, (n) => {
      // Un champ est soit un élément natif, soit un composant qui le transmet (ex. <Input name=… />) : on cherche par le nom.
      const champPossible = (typeof n.type === "string" && HOTES.has(n.type)) || typeof n.type === "function";
      if (!trouve && champPossible && n.props.name === nom) trouve = n;
    });
    return trouve;
  };
  const stabiliser = async () => {
    await attendre();
    for (let tour = 0; tour < 25 && inst.sale; tour++) {
      inst.rendre();
      await attendre();
    }
    if (inst.sale) throw new Error("Le composant ne se stabilise pas : état modifié à chaque rendu.");
  };
  const html = () => renderToStaticMarkup(inst.arbre as ReactElement);
  return {
    rendus: () => inst.rendus,
    html,
    texte: () => html().replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&apos;|’/g, "'").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim(),
    champ,
    async saisir(nom, valeur) {
      const cible = champ(nom);
      if (!cible) throw new Error(`Aucun champ « ${nom} » dans le formulaire.`);
      const onChange = cible.props.onChange;
      // Un champ non contrôlé (defaultValue sans onChange) ne réagit à rien : le banc le dit au lieu de passer en silence.
      if (typeof onChange !== "function") throw new Error(`Le champ « ${nom} » n'est pas piloté par l'état du composant (pas de onChange).`);
      onChange({ target: { value: valeur }, currentTarget: { value: valeur } });
      await stabiliser();
    },
    stabiliser,
  };
}
