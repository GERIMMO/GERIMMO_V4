"use client";
import { useEffect, useState, type ReactNode } from "react";

export function OngletsDossier({ onglets, initial = 0 }: { initial?: number; onglets: { titre: string; ancres: string[]; contenu: ReactNode }[] }) {
  const [actif, setActif] = useState(initial);
  useEffect(() => {
    function synchroniser() {
      const ancre = window.location.hash.slice(1);
      const index = onglets.findIndex(o => o.ancres.includes(ancre));
      if (index >= 0) setActif(index);
    }
    function clic(e: MouseEvent) {
      const lien = (e.target as Element).closest('a[href^="#"]');
      if (lien) {
        const index = onglets.findIndex(o => o.ancres.includes(lien.getAttribute("href")!.slice(1)));
        if (index >= 0) setActif(index);
      }
    }
    synchroniser();
    window.addEventListener("hashchange", synchroniser);
    document.addEventListener("click", clic);
    return () => { window.removeEventListener("hashchange", synchroniser); document.removeEventListener("click", clic); };
  }, [onglets]);
  return <div>
    <nav className="dossier-raccourcis" aria-label="Rubriques du logement">
      {onglets.map((o, i) => <button type="button" key={o.titre} aria-current={actif === i ? "page" : undefined} className="min-h-11 border-b-2 border-transparent px-3 text-sm aria-[current=page]:border-[var(--marque)] aria-[current=page]:text-[var(--marque-sombre)]" onClick={() => { setActif(i); const url = new URL(window.location.href); url.hash = o.ancres[0]; window.history.replaceState(null, "", url); }}>{o.titre}</button>)}
    </nav>
    {onglets.map((o, i) => <section key={o.titre} hidden={actif !== i} aria-label={o.titre} className="space-y-4">{o.contenu}</section>)}
  </div>;
}
