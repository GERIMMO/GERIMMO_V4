"use client";
import { createContext, useActionState, useContext, useEffect, useRef } from "react";

/** Les formulaires hors assistant gardent leur comportement habituel. */
export const CompletudeBail = createContext<{ manquants: string[]; erreur?: string } | null>(null);
export const SuiviEnregistrement = createContext<(() => void) | null>(null);

export function useActionStateSuivi<State extends { succes?: string }, Payload>(
  action: (state: Awaited<State>, payload: Payload) => State | Promise<State>,
  initial: Awaited<State>,
) {
  const retour = useActionState<State, Payload>(action, initial);
  const notifier = useContext(SuiviEnregistrement);
  const etat = retour[0];
  const precedent = useRef(etat);
  useEffect(() => {
    if (precedent.current === etat) return;
    precedent.current = etat;
    if (etat.succes) notifier?.();
  }, [etat, notifier]);
  return retour;
}
