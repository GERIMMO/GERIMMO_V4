"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Rubrique = "suivi" | "devis" | "echanges" | "historique";
export type ActionIncident = {
  titre: string; cible: string; responsable: string; priorite: number;
  etat?: string; echeance?: string;
};
const rubriques: { id: Rubrique; titre: string }[] = [
  { id: "suivi", titre: "Suivi" }, { id: "devis", titre: "Devis et facture" },
  { id: "echanges", titre: "Échanges" }, { id: "historique", titre: "Historique" },
];
const ContexteIncident = createContext<{
  vue: Rubrique; action: ActionIncident; secondaire?: ActionIncident; etat: string;
  signaler: (id: string, action: ActionIncident | null) => void;
} | null>(null);

/** Organisation visuelle seulement : tous les formulaires restent montés et protégés. */
export function CadreIncident({ actif, action, etat, children }: {
  actif: boolean; action: ActionIncident; etat: string; children: ReactNode;
}) {
  const [vue, choisir] = useState<Rubrique>("suivi");
  const [actions, definir] = useState<Record<string, ActionIncident>>({});
  const signaler = useCallback((id: string, nouvelle: ActionIncident | null) => {
    definir(avant => {
      if (nouvelle && JSON.stringify(avant[id]) === JSON.stringify(nouvelle)) return avant;
      if (!nouvelle && !avant[id]) return avant;
      const suivant = { ...avant };
      if (nouvelle) suivant[id] = nouvelle; else delete suivant[id];
      return suivant;
    });
  }, []);
  useEffect(() => {
    if (!actif) return;
    const suivre = () => {
      const id = window.location.hash.slice(1);
      const cible = document.getElementById(id);
      const rubrique = rubriques.find(r => `incident-${r.id}` === id)?.id
        ?? cible?.closest<HTMLElement>("[data-rubrique-incident]")?.dataset.rubriqueIncident;
      choisir(rubriques.some(r => r.id === rubrique) ? rubrique as Rubrique : "suivi");
      if (cible) requestAnimationFrame(() => {
        let parent: HTMLElement | null = cible;
        while (parent) {
          if (parent instanceof HTMLDetailsElement) parent.open = true;
          parent = parent.parentElement;
        }
        cible.scrollIntoView({ block: "nearest" });
      });
    };
    suivre();
    window.addEventListener("hashchange", suivre);
    return () => window.removeEventListener("hashchange", suivre);
  }, [actif]);
  if (!actif) return <>{children}</>;
  const ordonnees = [action, ...Object.values(actions)].sort((a, b) => b.priorite - a.priorite);
  const prioritaire = ordonnees[0];
  const secondaire = prioritaire.priorite < 100 ? ordonnees.find(a => a.priorite > 0 && a.cible !== prioritaire.cible) : undefined;
  return <ContexteIncident.Provider value={{ vue, action: prioritaire, secondaire, etat, signaler }}>
    {children}
    <noscript><style>{`[data-rubrique-incident][hidden]{display:block!important}`}</style></noscript>
  </ContexteIncident.Provider>;
}

/** Les données viennent des composants existants, après leurs lectures et contrôles. */
export function PrioriteIncident({ id, action }: { id: string; action: ActionIncident }) {
  const signaler = useContext(ContexteIncident)?.signaler;
  const contenu = JSON.stringify(action);
  useEffect(() => {
    signaler?.(id, JSON.parse(contenu) as ActionIncident);
    return () => signaler?.(id, null);
  }, [signaler, id, contenu]);
  return null;
}

export function NavigationIncident() {
  const contexte = useContext(ContexteIncident);
  if (!contexte) return null;
  const { action, secondaire, vue, etat } = contexte;
  return <div className="space-y-3">
    <section className="rounded-xl border border-border bg-card p-4" aria-label="Ce qu’il vous reste à faire">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading text-lg">Ce qu’il vous reste à faire</h3>
        <span className="text-sm text-muted-foreground">{etat === "clos" ? "Clôturé" : action.etat ?? ({ declare: "Signalé", rouvert: "À reprendre", qualifie: "À organiser", affecte: "Artisan sollicité", en_cours: "Intervention en cours", termine: "Intervention réalisée" }[etat] ?? "Suivi à vérifier")}</span>
      </div>
      <a href={`#${action.cible}`} className="mt-3 inline-flex min-h-11 items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">{action.titre} →</a>
      <p className="mt-2 text-sm text-muted-foreground">Responsable : {action.responsable}{action.echeance && <> · {action.echeance}</>}</p>
      {secondaire && <a href={`#${secondaire.cible}`} className="mt-1 inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">{secondaire.titre} →</a>}
    </section>
    <nav aria-label="Rubriques de l’incident" className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1 sm:grid-cols-4">
      {rubriques.map(r => <a key={r.id} href={`#incident-${r.id}`} aria-current={vue === r.id ? "page" : undefined}
        className={`flex min-h-11 items-center justify-center rounded-lg px-2 py-2 text-center text-sm font-medium ${vue === r.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background"}`}>{r.titre}</a>)}
    </nav>
  </div>;
}

export function RubriqueIncident({ rubrique, children }: { rubrique: Rubrique; children: ReactNode }) {
  const contexte = useContext(ContexteIncident);
  if (!contexte) return <>{children}</>;
  return <div data-rubrique-incident={rubrique} hidden={contexte.vue !== rubrique}>{children}</div>;
}
