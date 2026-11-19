"use client";

import { useSyncExternalStore, type ReactNode, type FormEvent } from "react";

const vues = [
  { id: "loyers", libelle: "Loyers" },
  { id: "depenses", libelle: "Dépenses" },
  { id: "operations", libelle: "Bilan de l’année" },
] as const;

function lireVue() {
  const ancre = window.location.hash.slice(1);
  return ancre === "declaration" ? "operations" : vues.some(v => v.id === ancre) ? ancre : "loyers";
}
function suivreVue(changement: () => void) {
  window.addEventListener("hashchange", changement);
  return () => window.removeEventListener("hashchange", changement);
}

/** Présentation uniquement : les montants et droits restent calculés par le serveur. */
export function NavigationFinances({ loyers, depenses, bilan, vide }: {
  loyers: ReactNode; depenses: ReactNode; bilan: ReactNode; vide?: ReactNode;
}) {
  const vue = useSyncExternalStore(suivreVue, lireVue, () => "loyers");
  return <div className="finances-vues space-y-4">
    <nav aria-label="Rubriques des finances" className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted/40 p-1">
      {vues.map(v => <a key={v.id} href={`#${v.id}`} onClick={e => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        if (window.location.hash !== `#${v.id}`) {
          window.history.pushState(null, "", `#${v.id}`);
          window.dispatchEvent(new HashChangeEvent("hashchange"));
        }
      }} aria-current={vue === v.id ? "page" : undefined}
        className={`flex min-h-12 items-center justify-center rounded-lg px-2 py-2 text-center text-sm font-medium transition-colors ${vue === v.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground"}`}>{v.libelle}</a>)}
    </nav>
    {vide || <>
      <div hidden={vue !== "loyers"}>{loyers}</div>
      <div hidden={vue !== "depenses"}>{depenses}</div>
      <div hidden={vue !== "operations"}>{bilan}</div>
    </>}
    <noscript><style>{`.finances-vues > [hidden]{display:block!important}`}</style><p className="text-sm">Les trois rubriques sont affichées à la suite sans JavaScript.</p></noscript>
  </div>;
}

/** GET natif, mêmes paramètres et validations serveur ; la rubrique reste sélectionnée. */
export function FiltresFinances({ action, children }: { action: string; children: ReactNode }) {
  function preparer(form: HTMLFormElement) { form.action = action + window.location.hash; }
  function changer(e: FormEvent<HTMLFormElement>) {
    if (e.target instanceof HTMLSelectElement) {
      preparer(e.currentTarget);
      e.currentTarget.requestSubmit();
    }
  }
  return <form data-saisie-libre action={action} onChange={changer} onSubmit={e => preparer(e.currentTarget)}
    className="barre-filtres grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
    {children}
  </form>;
}

/** L’ancien lien #declaration ouvre toujours le volet qui contient le récapitulatif. */
export function OutilsComptables({ children }: { children: ReactNode }) {
  const declaration = useSyncExternalStore(suivreVue, () => window.location.hash === "#declaration", () => false);
  return <details open={declaration} className="rounded-xl border border-border bg-muted/20 p-4" id="pour-mon-comptable">
    <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 font-medium">Pour mon comptable <span aria-hidden="true">⌄</span></summary>
    {children}
  </details>;
}
