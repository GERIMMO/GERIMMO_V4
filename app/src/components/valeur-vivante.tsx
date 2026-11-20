"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Un chiffre de tableau de bord qui signale son changement (Design System « Maison », 20/11/2026).
 *
 * Le serveur rend la valeur définitive : rien ne défile au chargement, un montant est exact dès la première image.
 * Quand la valeur CHANGE alors que l'écran est ouvert (un encaissement vient d'être saisi, une demande vient
 * d'être traitée), un halo champagne passe brièvement dessus, et les lecteurs d'écran l'annoncent. Le halo
 * s'éteint sous `prefers-reduced-motion` (systeme.css) ; l'annonce, elle, reste.
 */
export function ValeurVivante({ valeur, children, className }: { valeur: string | number; children: ReactNode; className?: string }) {
  const precedente = useRef(valeur);
  const [change, setChange] = useState(false);

  useEffect(() => {
    if (precedente.current === valeur) return;
    precedente.current = valeur;
    // Réaction à une nouvelle valeur reçue du serveur : l'état ne peut pas se déduire au rendu.
    setChange(true);
    const fin = window.setTimeout(() => setChange(false), 1300);
    return () => window.clearTimeout(fin);
  }, [valeur]);

  return (
    <span data-valeur-vivante data-change={change ? "1" : undefined} aria-live="polite" className={className}>
      {children}
    </span>
  );
}
