"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/ui/spinner";
import { genererPropositions, type EtatPublication } from "@/app/actions/publications";

// Le bouton commun des actions secondaires (24/09) : à côté de « Nouvel
// article » (`.btn-or`), un bouton outline de 26 px, plus petit et autrement
// arrondi, faisait deux styles pour deux actions voisines.
function Envoi() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-secondaire" disabled={pending}>
      {pending && <Spinner />}
      Chercher des sujets
    </button>
  );
}

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
      <Envoi />
      {etat.succes && <span className="text-[13px] text-[var(--success)]">{etat.succes}</span>}
      {etat.erreur && <span className="text-[13px] text-[var(--destructive)]">{etat.erreur}</span>}
    </form>
  );
}
