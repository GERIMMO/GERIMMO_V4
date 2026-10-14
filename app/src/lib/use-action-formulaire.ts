"use client";

import { preparerSoumission, confirmerSoumission, retourConfirme } from "./protection-saisie";
import { unstable_rethrow } from "next/navigation";
import { SuiviEnregistrement } from "./suivi-enregistrement";
import { messageApresEchec } from "./session-expiree";
import { useContext, useRef, useState, type FormEvent } from "react";

type Retour = { erreur?: string; succes?: string };
/** Le retour métier ne dépend pas du commit de la transition de revalidation. */
export function useActionFormulaire<T extends Retour>(action: (etat: T, donnees: FormData) => Promise<T>, resetApresSucces = false) {
  const notifier = useContext(SuiviEnregistrement);
  const [etat, setEtat] = useState<T>({} as T);
  const [enCours, setEnCours] = useState(false);
  const [version, setVersion] = useState(0);
  const verrou = useRef(false);
  const soumettre = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (verrou.current) return;
    const formulaire = event.currentTarget;
    const donnees = new FormData(formulaire);
    preparerSoumission(formulaire, donnees);
    const bouton = (event.nativeEvent as SubmitEvent).submitter;
    if (bouton instanceof HTMLButtonElement && bouton.name) donnees.set(bouton.name, bouton.value);
    verrou.current = true;
    setEnCours(true);
    setEtat({} as T);
    try {
      const retour = await action(etat, donnees);
      setEtat(retour);
      if (retourConfirme(retour)) {
        const inchange = confirmerSoumission(donnees);
        notifier?.();
        if (inchange && resetApresSucces) setVersion((v) => v + 1);
      }
    } catch (erreur) {
      unstable_rethrow(erreur);
      // Session expirée (redirigée par le proxy) ou réponse perdue : le message n'est pas le même (audit du 13/10).
      setEtat({ erreur: await messageApresEchec("La confirmation n’a pas pu être reçue. Votre saisie est conservée ; rouvrez le dossier pour vérifier le résultat avant de recommencer.") } as T);
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  };
  return { etat, enCours, soumettre, version };
}
