"use client";

import { useRef, useState, type FormEvent } from "react";

type Retour = { erreur?: string; succes?: string };
/** Le retour métier ne dépend pas du commit de la transition de revalidation. */
export function useActionFormulaire<T extends Retour>(action: (etat: T, donnees: FormData) => Promise<T>, resetApresSucces = false) {
  const [etat, setEtat] = useState<T>({} as T);
  const [enCours, setEnCours] = useState(false);
  const [version, setVersion] = useState(0);
  const verrou = useRef(false);
  const soumettre = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (verrou.current) return;
    const formulaire = event.currentTarget;
    const donnees = new FormData(formulaire);
    const bouton = (event.nativeEvent as SubmitEvent).submitter;
    if (bouton instanceof HTMLButtonElement && bouton.name) donnees.set(bouton.name, bouton.value);
    verrou.current = true;
    setEnCours(true);
    setEtat({} as T);
    try {
      const retour = await action(etat, donnees);
      setEtat(retour);
      if (retour.succes && resetApresSucces) setVersion((v) => v + 1);
    } catch {
      setEtat({ erreur: "La confirmation n’a pas pu être reçue. Votre saisie est conservée ; rouvrez le dossier pour vérifier le résultat avant de recommencer." } as T);
    } finally {
      verrou.current = false;
      setEnCours(false);
    }
  };
  return { etat, enCours, soumettre, version };
}
