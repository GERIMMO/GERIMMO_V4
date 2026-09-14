"use client";

import { useRouter } from "next/navigation";
import type { EtatRetour } from "@/app/actions/retours";
import { useActionFormulaire } from "@/lib/use-action-formulaire";

/** Actualise aussi les listes filtrées après confirmation de l’écriture. */
export function useActionRetour(
  action: (etat: EtatRetour, donnees: FormData) => Promise<EtatRetour>,
) {
  const router = useRouter();
  return useActionFormulaire<EtatRetour>(async (etat, donnees) => {
    const resultat = await action(etat, donnees);
    if (resultat.succes) router.refresh();
    return resultat;
  });
}
