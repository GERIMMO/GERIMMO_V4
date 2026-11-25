"use client";

// Relecture du 24/11/2026 (constats B1 et B2 de la décision Q11) : l'état de la voie électronique de chaque modèle de
// document, calculé une fois côté serveur par la mise en page de l'espace (lib/signature-ouverture.ts) et offert aux
// boutons et aux phrases des écrans. Sans fournisseur (composant rendu seul) : « non proposée », l'écran d'avant.
import { createContext, useContext } from "react";
import type { ModeleSignature } from "@/lib/politique-signature";
import { VOIES_NON_PROPOSEES, phraseVoiesSignature, type VoieElectronique, type VoiesSignature } from "@/lib/voie-signature";

const Voies = createContext<VoiesSignature>(VOIES_NON_PROPOSEES);

export function FournisseurVoiesSignature({ voies, children }: { voies: VoiesSignature; children?: React.ReactNode }) {
  return <Voies.Provider value={voies}>{children}</Voies.Provider>;
}

/** L'état de la voie électronique de ce modèle, pour la personne connectée. */
export function useVoieSignature(code: ModeleSignature): VoieElectronique {
  return useContext(Voies)[code];
}

/** La phrase qui présente les deux voies (électronique, papier) à cet endroit ; rien pour l'agence. */
export function PhraseVoiesSignature({ code, papier, className = "text-sm text-muted-foreground" }: { code: ModeleSignature; papier: string; className?: string }) {
  const voie = useVoieSignature(code);
  const phrase = phraseVoiesSignature(voie, papier);
  return phrase ? <p className={className} data-voies-signature={voie}>{phrase}</p> : null;
}
