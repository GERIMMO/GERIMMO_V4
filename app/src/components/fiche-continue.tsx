"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./fiche-continue.module.css";

/** Les rubriques restent montées ; leurs formulaires gardent leur état. */
export function FicheContinue({ rubriques, className, afficherNavigation = true }: {
  rubriques: {
    id: string;
    titre: string;
    contenu: ReactNode;
    navigation?: boolean;
    repliable?: boolean;
    resume?: ReactNode;
    colonne?: "principale" | "secondaire";
  }[];
  className?: string;
  afficherNavigation?: boolean;
}) {
  const racine = useRef<HTMLDivElement>(null);
  const dernierHrefTraite = useRef<string | null>(null);
  const pathname = usePathname();
  // Next renouvelle cet objet quand l'URL change, y compris son fragment.
  // Garder l'objet permet aussi de retrouver une navigation interceptée.
  const recherche = useSearchParams();

  useEffect(() => {
    let defilement: number | undefined;
    const ouvrir = (hash: string, clic?: MouseEvent) => {
      if (!hash) return;
      let cible: HTMLElement | null;
      try { cible = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return; }
      if (!cible || !racine.current?.contains(cible)) return;
      if (defilement !== undefined) cancelAnimationFrame(defilement);
      // Les SectionLot ouvrent elles-mêmes leurs panneaux sur ce même geste.
      // Attendre la fin du clic laisse ses autres gestionnaires l'annuler.
      // Next l'intercepte aussi : son URL confirme alors l'ancre réellement ouverte.
      defilement = requestAnimationFrame(() => {
        if (clic?.defaultPrevented && location.hash !== hash) return;
        if (!cible?.isConnected || !racine.current?.contains(cible)) return;
        for (let parent: HTMLElement | null = cible; parent && parent !== racine.current; parent = parent.parentElement) {
          if (parent instanceof HTMLDetailsElement) parent.open = true;
        }
        cible.scrollIntoView({ block: "start" });
        dernierHrefTraite.current = location.href;
      });
    };
    const hashChange = () => ouvrir(location.hash);
    const clic = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const lien = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(lien instanceof HTMLAnchorElement) || lien.hasAttribute("download") || (lien.target && lien.target !== "_self")) return;
      const url = new URL(lien.href);
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search && url.hash) ouvrir(url.hash, event);
    };
    // Une réponse serveur peut renouveler les paramètres sans navigation.
    // Ne pas ramener l'utilisateur vers une ancre déjà traitée dans ce cas.
    // Les clics et hashchange explicites restent toujours pris en compte.
    if (dernierHrefTraite.current !== location.href) hashChange();
    window.addEventListener("hashchange", hashChange);
    // Next peut intercepter un lien sans produire de hashchange ; on laisse
    // cependant la navigation et les protections de saisie décider du clic.
    document.addEventListener("click", clic, true);
    return () => {
      window.removeEventListener("hashchange", hashChange);
      document.removeEventListener("click", clic, true);
      if (defilement !== undefined) cancelAnimationFrame(defilement);
    };
  }, [pathname, recherche]);

  const rendreRubrique = (rubrique: (typeof rubriques)[number]) => rubrique.repliable ? <details key={rubrique.id} id={rubrique.id}
    data-rubrique-dossier={rubrique.id} aria-label={rubrique.titre} className={styles.rubrique}>
    <summary>{rubrique.resume ?? rubrique.titre}</summary>
    {rubrique.contenu}
  </details> : <section key={rubrique.id} id={rubrique.id}
    data-rubrique-dossier={rubrique.id} aria-label={rubrique.titre} className={styles.rubrique} tabIndex={-1}>
    {rubrique.contenu}
  </section>;
  const colonnes = (["principale", "secondaire"] as const)
    .map(id => ({ id, rubriques: rubriques.filter(rubrique => rubrique.colonne === id) }))
    .filter(colonne => colonne.rubriques.length > 0);

  return <div ref={racine} data-fiche-continue className={[styles.fiche, className].filter(Boolean).join(" ")}
    onInvalidCapture={event => {
      // La validation native doit pouvoir atteindre un champ placé dans un
      // formulaire volontairement replié, sans créer de formulaire en double.
      for (let parent: HTMLElement | null = event.target instanceof HTMLElement ? event.target : null;
        parent && parent !== racine.current; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
    }}>
    {afficherNavigation && <nav aria-label="Sur cette fiche" data-navigation-fiche className={styles.navigation}>
      {rubriques.filter(rubrique => rubrique.navigation !== false).map(rubrique => <a key={rubrique.id} href={`#${encodeURIComponent(rubrique.id)}`}>{rubrique.titre}</a>)}
    </nav>}
    {colonnes.length > 0 ? <>
      <div data-colonnes-fiche className={styles.colonnes}>
        {colonnes.map(colonne => <div key={colonne.id} data-colonne-fiche={colonne.id} className={styles.colonne}>
          {colonne.rubriques.map(rendreRubrique)}
        </div>)}
      </div>
      {rubriques.filter(rubrique => !rubrique.colonne).map(rendreRubrique)}
    </> : rubriques.map(rendreRubrique)}
  </div>;
}
