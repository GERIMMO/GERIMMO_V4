"use client";

import { useActionState } from "react";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { genererPropositions, type EtatPublication } from "@/app/actions/publications";

// Le moteur tourne tout seul chaque lundi à 6 h ; ce bouton sert à le
// déclencher à la main — à la reprise d'un retard, ou pour voir tout de suite
// ce qu'une veine nouvellement ajoutée produit.
export function BoutonChercherSujets() {
  const [etat, action] = useActionState<EtatPublication, FormData>(
    async () => genererPropositions(),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <BoutonEnvoi variant="outline" size="sm">
        Chercher des sujets
      </BoutonEnvoi>
      {etat.succes && <span className="text-[13px] text-[var(--success)]">{etat.succes}</span>}
      {etat.erreur && <span className="text-[13px] text-[var(--destructive)]">{etat.erreur}</span>}
    </form>
  );
}
