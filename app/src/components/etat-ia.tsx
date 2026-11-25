"use client";

// Interrupteur IA (22/11/2026) : l'état de l'IA, lu une fois par la mise en page de chaque espace et offert aux
// composants clients. Sans fournisseur (un composant rendu seul), l'état vaut « active » : rien ne change par défaut ;
// la base refuse de toute façon l'appel quand l'IA est désactivée.
import { createContext, useContext } from "react";
import type { EtatIA } from "@/lib/etat-ia";

const ContexteEtatIA = createContext<EtatIA>("active");

export function FournisseurEtatIA({ etat, children }: { etat: EtatIA; children?: React.ReactNode }) {
  return <ContexteEtatIA.Provider value={etat}>{children}</ContexteEtatIA.Provider>;
}

/** L'état de l'IA pour l'espace affiché. */
export function useEtatIA(): EtatIA {
  return useContext(ContexteEtatIA);
}

/** Vrai seulement quand une fonction assistée peut réellement répondre : sinon, l'écran montre la saisie manuelle. */
export function useIAUtilisable(): boolean {
  return useContext(ContexteEtatIA) === "active";
}
