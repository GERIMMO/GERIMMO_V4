/**
 * Le banc navigateur de l'encart « Nos conditions générales évoluent » (plan de conformité du 23/10/2026, R19 ;
 * relecture adverse du 24/10, défaut 6). Il HYDRATE, dans un vrai Chromium et sous <StrictMode>, le HTML que le serveur
 * a rendu pour le VRAI composant `EcranNouvelleVersionConditions`. Seule l'action d'acceptation est remplacée
 * (`actions-acceptation-neutre.ts`) : le banc n'éprouve que « Plus tard ».
 *
 * Il est assemblé par `tests/nouvelle-version-conditions-navigateur.test.ts` ; il ne fait pas partie de l'application.
 */
import { StrictMode, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import { EcranNouvelleVersionConditions } from "@/components/ecran-nouvelle-version-conditions";

export type ProprietesEncart = { orgId: string; version: string; dateVersion: string; paragraphes: string[]; report: string };

export type BancConditions = {
  proprietes: ProprietesEncart;
  /** Erreurs que React a rattrapées (une hydratation qui ne correspond pas au HTML du serveur, par exemple). */
  erreurs: string[];
  /** Vrai une fois l'hydratation faite. */
  pret: boolean;
};

declare global {
  interface Window {
    __bancConditions: BancConditions;
  }
}

const banc = window.__bancConditions;

function Pret() {
  useEffect(() => {
    banc.pret = true;
  }, []);
  return null;
}

hydrateRoot(
  document.getElementById("racine")!,
  <StrictMode>
    <EcranNouvelleVersionConditions {...banc.proprietes} />
    <Pret />
  </StrictMode>,
  { onRecoverableError: (erreur) => banc.erreurs.push(erreur instanceof Error ? erreur.message : String(erreur)) },
);
