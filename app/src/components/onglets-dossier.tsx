"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./onglets-dossier.module.css";

/** Un seul panneau visible ; les formulaires restent montés lors du changement. */
export function OngletsDossier({ rubriques, initiale, libelle = "Rubriques du dossier" }: {
  rubriques: { id: string; titre: string; contenu: ReactNode }[];
  initiale?: string;
  libelle?: string;
}) {
  const [active, setActive] = useState(initiale ?? rubriques[0]?.id);
  const racine = useRef<HTMLDivElement>(null);
  const uid = useId();
  const pathname = usePathname();
  const recherche = useSearchParams().toString();
  useEffect(() => {
    const ouvrir = (hash: string) => {
      let cible: HTMLElement | null;
      try { cible = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return; }
      const panneau = cible?.closest<HTMLElement>("[data-rubrique-dossier]");
      if (!cible || !panneau || !racine.current?.contains(panneau)) return;
      setActive(panneau.dataset.rubriqueDossier!);
      for (let parent: HTMLElement | null = cible; parent && parent !== racine.current; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
      requestAnimationFrame(() => cible?.scrollIntoView({ block: "start" }));
    };
    const hashChange = () => ouvrir(location.hash);
    const clic = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const lien = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(lien instanceof HTMLAnchorElement)) return;
      const url = new URL(lien.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search && url.hash) ouvrir(url.hash);
    };
    hashChange();
    window.addEventListener("hashchange", hashChange);
    document.addEventListener("click", clic);
    return () => { window.removeEventListener("hashchange", hashChange); document.removeEventListener("click", clic); };
  }, [pathname, recherche]);

  function choisir(id: string) {
    setActive(id);
    // Remplacer le fragment évite de rouvrir une ancienne rubrique après actualisation.
    history.replaceState(history.state, "", `#${encodeURIComponent(id)}`);
  }
  return <div data-onglets-dossier className={styles.dossier} ref={racine} onInvalidCapture={event => {
    const champ = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const premier = champ.form?.querySelector<HTMLElement>("input:invalid, select:invalid, textarea:invalid") ?? champ;
    const panneau = premier.closest<HTMLElement>("[data-rubrique-dossier]");
    if (panneau) flushSync(() => setActive(panneau.dataset.rubriqueDossier!));
  }}>
    <div role="tablist" aria-label={libelle} className={styles.onglets}>
      {rubriques.map((rubrique, index) => <button key={rubrique.id} type="button" role="tab"
        id={`${uid}-onglet-${rubrique.id}`} aria-controls={rubrique.id} aria-selected={active === rubrique.id}
        tabIndex={active === rubrique.id ? 0 : -1} onClick={() => choisir(rubrique.id)}
        onKeyDown={event => {
          const prochain = event.key === "ArrowRight" ? (index + 1) % rubriques.length : event.key === "ArrowLeft" ? (index + rubriques.length - 1) % rubriques.length : event.key === "Home" ? 0 : event.key === "End" ? rubriques.length - 1 : null;
          if (prochain === null) return;
          event.preventDefault(); choisir(rubriques[prochain].id);
          document.getElementById(`${uid}-onglet-${rubriques[prochain].id}`)?.focus();
        }}>{rubrique.titre}</button>)}
    </div>
    {rubriques.map(rubrique => <section key={rubrique.id} role="tabpanel" tabIndex={0} id={rubrique.id}
      aria-labelledby={`${uid}-onglet-${rubrique.id}`} data-rubrique-dossier={rubrique.id}
      hidden={active !== rubrique.id} className={styles.panneau}>{rubrique.contenu}</section>)}
  </div>;
}
