"use client";
import { createContext } from "react";
export const EtapeComplementsBail = createContext<{
  etape: string; revision?: number; ouvrir: (id: string) => void; signalerEnregistrement?: (enCours: boolean) => void;
  // Une étape quittée sans enregistrer ne perd pas sa saisie en silence (CB-05) : le formulaire
  // signale ses étapes modifiées et peut retenir un changement d’étape le temps de proposer d’enregistrer.
  allerA?: (ancre: string) => void;
  signalerNonEnregistrees?: (etapes: string[]) => void;
  definirGarde?: (garde: ((ancre: string) => boolean) | null) => void;
} | null>(null);
