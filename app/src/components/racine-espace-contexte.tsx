"use client";

import { createContext, useContext, type ReactNode } from "react";
import { RACINE_AGENCE, baseDepuisRacine } from "@/lib/racine-espace";

/**
 * La racine des adresses de l'espace de gestion, pour les composants CLIENT (décision D27, lib/racine-espace.ts).
 *
 * Le layout de l'espace (app/agence/[orgId]/layout.tsx) sait si l'on est chez un propriétaire direct (« /espace ») ou
 * dans une agence (« /agence ») : il le dit une fois ici, et tout formulaire ou fenêtre de l'espace qui compose un lien
 * le lit sans que chaque parent ait à le lui transmettre. Hors de l'espace (pas de fournisseur), la valeur est
 * « /agence » : un lien émis par erreur sous cette racine pour un propriétaire direct est redirigé à vie vers
 * « /espace » par le proxy, il n'est jamais cassé.
 *
 * Les composants SERVEUR n'en ont pas besoin : ils lisent `estProprietaire` dans la garde de leur page.
 */
const Racine = createContext<string>(RACINE_AGENCE);

export function FournisseurRacineEspace({ racine, children }: { racine: string; children?: ReactNode }) {
  return <Racine.Provider value={racine}>{children}</Racine.Provider>;
}

/** « /espace » ou « /agence ». */
export function useRacineEspace(): string {
  return useContext(Racine);
}

/** « /espace/<id> » ou « /agence/<id> » : la base des liens de l'organisation affichée. */
export function useBaseEspace(orgId: string): string {
  return baseDepuisRacine(orgId, useContext(Racine));
}
