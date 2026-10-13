"use client";
import { unstable_rethrow } from "next/navigation";
import { useActionState } from "react";
import { confirmerSoumission, relierSoumission, retourConfirme } from "./protection-saisie";

/** Même contrat que React : aucune erreur, redirection ou valeur métier transformée. */
export function useActionStateProtegee<State, Payload>(
  action: (state: Awaited<State>, payload: Payload) => State | Promise<State>,
  initial: Awaited<State>,
  permalink?: string,
) {
  return useActionState<State, Payload>(async (etat, payload) => {
    if (payload instanceof FormData) relierSoumission(payload);
    try {
      const retour = await action(etat, payload);
      if (payload instanceof FormData && retourConfirme(retour)) confirmerSoumission(payload);
      return retour;
    } catch (erreur) {
      unstable_rethrow(erreur);
      if (!etat || typeof etat !== "object") throw erreur;
      return { ...etat, succes: undefined,
        erreur: "La confirmation n’a pas pu être reçue. Votre saisie reste dans cette page. Vérifiez le dossier avant de recommencer l’envoi.",
      } as State;
    }
  }, initial, permalink);
}
