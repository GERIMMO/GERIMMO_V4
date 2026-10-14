/**
 * Un moteur de hooks minimal, pour EXÉCUTER un composant client (ses effets, ses états, ses minuteurs) sans navigateur ni DOM.
 *
 * Le dépôt n'a ni jsdom ni happy-dom, et les tests des composants se limitaient à `renderToStaticMarkup` (qui n'exécute aucun
 * effet) ou à des expressions régulières sur le texte du source : une mutation de la logique d'un effet ne faisait rougir rien.
 * Ici, le composant réel tourne : `useState`, `useRef`, `useEffect` (avec ses dépendances et son nettoyage) et
 * `useSyncExternalStore` sont remplacés par ceux de ce moteur, et le composant n'est appelé que lui-même (l'arbre rendu est
 * un arbre d'éléments React, parcouru par `trouver` / `texte`, les composants enfants ne sont pas déroulés).
 *
 * Usage (dans le fichier de test, AVANT l'import du composant) :
 *
 *   vi.mock("react", async (importOriginal) => {
 *     const reel = await importOriginal<typeof import("react")>();
 *     const { hooks } = await import("./aide/hooks-sans-dom");
 *     return { ...reel, ...hooks, default: { ...reel, ...hooks } };
 *   });
 *   const instance = monter(MonComposant, { ...props });
 *   instance.stabiliser();          // premier rendu, effets, rendus provoqués par les effets
 *   await instance.vider();         // microtâches (queueMicrotask), puis rendus provoqués
 *   instance.demonter();            // nettoyages des effets
 *
 * Limites assumées : pas de contexte, pas de suspense, pas de transitions, pas de mise à jour par lots ; un état modifié
 * hors d'un rendu relance un rendu à la prochaine microtâche (ou à `stabiliser()`).
 */
import type { ReactElement, ReactNode } from "react";

type Emplacement = {
  valeur?: unknown;
  poser?: (suivant: unknown) => void;
  deps?: readonly unknown[];
  nettoyage?: (() => void) | void;
};

let actif: Instance<unknown, unknown> | null = null;

function courant(): Instance<unknown, unknown> {
  if (!actif) throw new Error("hook appelé hors d'un composant monté par le moteur de test");
  return actif;
}

export class Instance<P, R> {
  private emplacements: Emplacement[] = [];
  private rang = 0;
  private effets: Array<() => void> = [];
  private sale = false;
  private monte = true;
  rendu!: R;
  nombreDeRendus = 0;

  constructor(private composant: (props: P) => R, public props: P) {}

  /** Un rendu, puis les effets que ce rendu a planifiés. */
  rendre(): void {
    const precedent = actif;
    actif = this as unknown as Instance<unknown, unknown>;
    this.rang = 0;
    this.sale = false;
    try {
      this.rendu = this.composant(this.props);
      this.nombreDeRendus++;
    } finally {
      actif = precedent;
    }
    for (const effet of this.effets.splice(0)) effet();
  }

  /** Rend jusqu'à ce qu'aucun état ne bouge plus (les effets qui posent un état relancent un rendu). */
  stabiliser(): void {
    let tours = 0;
    do {
      this.rendre();
      if (++tours > 25) throw new Error("le composant ne se stabilise pas (boucle de rendu)");
    } while (this.sale);
  }

  /** Laisse passer les microtâches (queueMicrotask, promesses résolues), puis rend ce qu'elles ont modifié. */
  async vider(): Promise<void> {
    for (let i = 0; i < 6; i++) await Promise.resolve();
    if (this.sale) this.stabiliser();
  }

  /** Change les propriétés et rend à nouveau. */
  avecProps(suite: Partial<P>): void {
    this.props = { ...this.props, ...suite };
    this.stabiliser();
  }

  demonter(): void {
    this.monte = false;
    for (const e of this.emplacements) if (e && typeof e.nettoyage === "function") e.nettoyage();
  }

  // ── hooks ──
  useState<T>(initial: T | (() => T)): [T, (suivant: T | ((precedent: T) => T)) => void] {
    const e = (this.emplacements[this.rang] ??= {});
    this.rang++;
    if (!("valeur" in e)) {
      e.valeur = typeof initial === "function" ? (initial as () => T)() : initial;
      e.poser = (suivant) => {
        if (!this.monte) return;
        const v = typeof suivant === "function" ? (suivant as (p: unknown) => unknown)(e.valeur) : suivant;
        if (Object.is(v, e.valeur)) return;
        e.valeur = v;
        this.sale = true;
        queueMicrotask(() => {
          if (this.sale && this.monte) this.stabiliser();
        });
      };
    }
    return [e.valeur as T, e.poser as (suivant: T | ((precedent: T) => T)) => void];
  }

  useRef<T>(initial: T): { current: T } {
    const e = (this.emplacements[this.rang] ??= {});
    this.rang++;
    if (!("valeur" in e)) e.valeur = { current: initial };
    return e.valeur as { current: T };
  }

  useEffect(effet: () => void | (() => void), deps?: readonly unknown[]): void {
    const e = (this.emplacements[this.rang] ??= {});
    this.rang++;
    const change = !e.deps || !deps || deps.length !== e.deps.length || deps.some((d, i) => !Object.is(d, e.deps![i]));
    if (!change) return;
    e.deps = deps;
    this.effets.push(() => {
      if (typeof e.nettoyage === "function") e.nettoyage();
      e.nettoyage = effet();
    });
  }

  useSyncExternalStore<T>(_abonner: unknown, instantane: () => T): T {
    this.emplacements[this.rang] ??= {};
    this.rang++;
    return instantane();
  }
}

export function monter<P, R>(composant: (props: P) => R, props: P): Instance<P, R> {
  return new Instance(composant, props);
}

export const hooks = {
  useState: <T>(initial: T | (() => T)) => courant().useState(initial),
  useRef: <T>(initial: T) => courant().useRef(initial),
  useEffect: (effet: () => void | (() => void), deps?: readonly unknown[]) => courant().useEffect(effet, deps),
  useSyncExternalStore: <T>(abonner: unknown, instantane: () => T) => courant().useSyncExternalStore(abonner, instantane),
};

// ── lecture de l'arbre d'éléments ──
type Noeud = ReactNode | ReactElement<Record<string, unknown>>;

function enfantsDe(noeud: Noeud): Noeud[] {
  if (Array.isArray(noeud)) return noeud;
  if (noeud && typeof noeud === "object" && "props" in noeud) {
    const enfants = (noeud as ReactElement<{ children?: Noeud }>).props.children;
    return enfants === undefined ? [] : Array.isArray(enfants) ? enfants : [enfants];
  }
  return [];
}

/** Tous les éléments de l'arbre (parcours en profondeur) qui satisfont le prédicat. */
export function trouver(arbre: Noeud, predicat: (el: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>>[] {
  const trouves: ReactElement<Record<string, unknown>>[] = [];
  const visiter = (n: Noeud) => {
    if (n && typeof n === "object" && !Array.isArray(n) && "props" in n && predicat(n as ReactElement<Record<string, unknown>>)) {
      trouves.push(n as ReactElement<Record<string, unknown>>);
    }
    for (const enfant of enfantsDe(n)) visiter(enfant);
  };
  visiter(arbre);
  return trouves;
}

/** Le texte visible de l'arbre (chaînes et nombres des éléments, sans déployer les composants). */
export function texte(arbre: Noeud): string {
  if (arbre === null || arbre === undefined || typeof arbre === "boolean") return "";
  if (typeof arbre === "string" || typeof arbre === "number") return String(arbre);
  return enfantsDe(arbre).map(texte).join("");
}
