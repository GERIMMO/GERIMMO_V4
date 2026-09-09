"use client";

import { useActionState } from "react";
import { regenererGrilleEdl, type EtatEdl } from "@/app/actions/edl";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

// Le lot a des pièces mais la grille de cet EDL est restée générique (elle a
// été générée avant leur déclaration) : un clic suffit pour la reconstruire —
// sans repasser par la fiche du lot.
export function BoutonRegenererGrille({
  orgId,
  bailId,
  edlId,
  libelle = "Régénérer la grille depuis les pièces du lot",
}: {
  orgId: string;
  bailId: string;
  edlId: string;
  libelle?: string;
}) {
  const action = regenererGrilleEdl.bind(null, orgId, bailId, edlId);
  const [etat, formAction] = useActionState<EtatEdl, FormData>(action, {});

  return (
    <form action={formAction} className="mt-2 space-y-1">
      <BoutonEnvoi size="sm" enCoursTexte="Régénération…">
        {libelle}
      </BoutonEnvoi>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
    </form>
  );
}
