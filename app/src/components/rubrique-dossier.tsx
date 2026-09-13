"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** Les formulaires restent montés : refermer une rubrique conserve la saisie. */
export function RubriqueDossier({ id, titre, resume, ouverte = false, children }: {
  id: string; titre: string; resume: string; ouverte?: boolean; children: ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const ouvrirCible = (hash: string, defiler: boolean) => {
      let cible: HTMLElement | null;
      try { cible = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return; }
      if (!cible || !details.current?.contains(cible)) return;
      // Une alerte peut viser un formulaire situé dans plusieurs rubriques.
      let parent: HTMLElement | null = cible;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      if (defiler) requestAnimationFrame(() => cible?.scrollIntoView({ block: "start" }));
    };
    const hashChange = () => ouvrirCible(window.location.hash, true);
    const clic = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const lien = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(lien instanceof HTMLAnchorElement)) return;
      const url = new URL(lien.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search && url.hash)
        ouvrirCible(url.hash, false);
    };
    hashChange();
    window.addEventListener("hashchange", hashChange);
    document.addEventListener("click", clic);
    return () => { window.removeEventListener("hashchange", hashChange); document.removeEventListener("click", clic); };
  }, []);
  return <details id={id} ref={details} open={ouverte} className="dossier-rubrique">
    <summary><span className="min-w-0"><span className="dossier-rubrique-titre">{titre}</span><span className="dossier-rubrique-resume">{resume}</span></span><ChevronDown className="dossier-chevron size-5 shrink-0" aria-hidden="true" /></summary>
    <div className="dossier-rubrique-contenu space-y-4">{children}</div>
  </details>;
}
