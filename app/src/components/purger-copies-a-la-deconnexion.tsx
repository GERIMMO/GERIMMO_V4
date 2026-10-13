"use client";

import { useEffect, useRef } from "react";
import { purgerCopiesLocales } from "@/lib/copies-locales";

/**
 * À poser DANS un formulaire de déconnexion : au clic sur « Se déconnecter », les copies de saisie gardées sur
 * l'appareil (brouillons, pièces jointes) sont effacées avant que la session ne se ferme (audit du 13/10, PR178-A-01).
 */
export function PurgerCopiesALaDeconnexion() {
  const repere = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const formulaire = repere.current?.closest("form");
    if (!formulaire) return;
    formulaire.addEventListener("submit", purgerCopiesLocales);
    return () => formulaire.removeEventListener("submit", purgerCopiesLocales);
  }, []);
  return <span ref={repere} hidden />;
}
