"use client";
import { useContext, useEffect, useRef } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";

import { SuiviEnregistrement } from "./contexte-enregistrement";
export { SuiviEnregistrement, CompletudeBail } from "./contexte-enregistrement";

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
    notifier?.(Boolean(etat.succes));
  }, [etat, notifier]);
  return retour;
}
