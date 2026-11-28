"use client";

import { useActionState } from "react";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { reprendreEssaiPremierBien } from "./reprise-premier-bien";

export function FormulaireReprisePremierBien({ orgId }: { orgId: string }) {
  const [etat, action] = useActionState(reprendreEssaiPremierBien.bind(null, orgId), {});
  return (
    <form data-saisie-libre action={action} className="mt-4 space-y-3">
      <p className="text-sm">Vous pouvez rouvrir cet espace une seule fois, sans carte bancaire. Vous pourrez souscrire après avoir ajouté votre premier bien.</p>
      <BoutonEnvoi enCoursTexte="Réouverture…" className="min-h-11 max-w-full whitespace-normal text-left">
        Rouvrir mon espace 7 jours pour ajouter mon premier bien
      </BoutonEnvoi>
      {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
    </form>
  );
}
