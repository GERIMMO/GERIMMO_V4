/**
 * Le banc navigateur de l'inscription du propriétaire (/inscription), relecture adverse du 23/10/2026 : même défaut que
 * PRO-4 sur « Vous louez en tant que ».
 *
 * Il HYDRATE, dans un vrai Chromium et sous <StrictMode>, le HTML que le serveur a rendu pour le VRAI formulaire
 * `FormulaireInscription`, câblé à la VRAIE action `inscrireProprietaire` (ses refus et la saisie qu'elle rend). Seuls la
 * fabrique de liens (`lien-mot-de-passe-neutre.ts`) et les modules propres au serveur de Next sont remplacés : la fabrique
 * note les métadonnées qu'elle aurait posées sur le compte et rend le refus préparé par le test. Rien n'est donc créé.
 *
 * Le banc note ce que le navigateur envoie réellement (événement `formdata`) dans `window.__bancInscription.envois`, et ce
 * que l'action aurait remis à la fabrique dans `window.__bancInscription.inscriptions`.
 *
 * Il est assemblé par `tests/inscription-navigateur.test.ts` ; il ne fait pas partie de l'application.
 */
import { StrictMode, useEffect } from "react";
import { hydrateRoot } from "react-dom/client";
import { FormulaireInscription } from "@/app/inscription/formulaire-inscription";
import type { ResultatInscription } from "@/lib/lien-mot-de-passe";

/** Un envoi tel que le navigateur l'a construit. */
export type EnvoiInscription = Record<string, string>;

export type BancInscription = {
  /** La durée d'essai que la page passe au formulaire : la même que dans le HTML du serveur, sans quoi l'hydratation diverge. */
  dureeEssai: string;
  envois: EnvoiInscription[];
  /** Ce que l'action a remis à la fabrique de liens (adresse, métadonnées du compte, destination). */
  inscriptions: { email: string; metadonnees: Record<string, unknown>; next: string }[];
  /** Les réponses préparées de la fabrique, dans l'ordre ; à défaut, un refus. */
  refus: ResultatInscription[];
  /** Erreurs que React a rattrapées (une hydratation qui ne correspond pas au HTML du serveur, par exemple). */
  erreurs: string[];
  /** Vrai une fois l'hydratation faite. */
  pret: boolean;
};

declare global {
  interface Window {
    __bancInscription: BancInscription;
  }
}

const banc = window.__bancInscription;
document.addEventListener(
  "formdata",
  (evenement) => {
    const envoi: EnvoiInscription = {};
    for (const [cle, valeur] of evenement.formData.entries()) if (typeof valeur === "string") envoi[cle] = valeur;
    banc.envois.push(envoi);
  },
  true,
);

function Pret() {
  useEffect(() => {
    banc.pret = true;
  }, []);
  return null;
}

hydrateRoot(
  document.getElementById("racine")!,
  <StrictMode>
    <FormulaireInscription dureeEssai={banc.dureeEssai} />
    <Pret />
  </StrictMode>,
  { onRecoverableError: (erreur) => banc.erreurs.push(erreur instanceof Error ? erreur.message : String(erreur)) },
);
