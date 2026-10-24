"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Le message rendu au retour sur la page (« archive en préparation », « identité à confirmer »…) : une région `status`
 * ou `alert` présente dès le chargement n'est pas annoncée par les lecteurs d'écran (relecture du 24/10, R2-8). Le
 * message reçoit donc le focus à l'arrivée (`tabIndex={-1}` : atteint par le code, pas par la touche Tab), ce qui le
 * fait lire et rapproche le clavier des gestes qui le suivent.
 */
export function MessageArchive({ erreur, children }: { erreur: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div ref={ref} role={erreur ? "alert" : "status"} tabIndex={-1} className={erreur ? "err space-y-2" : "space-y-2 rounded-xl bg-success-soft p-3 text-sm"}>
      {children}
    </div>
  );
}
