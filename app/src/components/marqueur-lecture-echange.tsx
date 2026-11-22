"use client";

import { useEffect, useRef } from "react";
import { marquerEchangeLu } from "@/app/actions/echanges-intervention";

/**
 * Audit palier 1 (P1-05). La discussion d'une intervention est « lue » quand son dernier message est PASSÉ SOUS LES
 * YEUX : ce repère, posé après le dernier message, le dit au serveur dès qu'il entre à l'écran — pas au chargement de
 * la page, où la discussion peut être plus bas, dans un onglet fermé ou dans une liste à faire défiler.
 *
 * À l'arrivée, la liste des messages est amenée sur le plus récent (elle seule défile, pas la page). `jusqua` est
 * l'instant du dernier message affiché, tel que la base l'a rendu : un message arrivé depuis reste « à lire ».
 */
export function MarqueurLectureEchange({ intervention, jusqua }: { intervention: string; jusqua: string }) {
  const repere = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = repere.current;
    if (!element) return;
    const liste = element.closest<HTMLElement>("[data-messages-intervention]");
    if (liste) liste.scrollTop = liste.scrollHeight;
    let fait = false;
    const marquer = () => {
      if (fait) return;
      fait = true;
      void marquerEchangeLu(intervention, jusqua);
    };
    if (typeof IntersectionObserver === "undefined") { marquer(); return; }
    const observateur = new IntersectionObserver((entrees) => {
      if (entrees.some((e) => e.isIntersecting)) { marquer(); observateur.disconnect(); }
    });
    observateur.observe(element);
    return () => observateur.disconnect();
  }, [intervention, jusqua]);
  return <span ref={repere} data-marqueur-lecture aria-hidden="true" className="block h-px" />;
}
