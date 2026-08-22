"use client";

import { useActionState } from "react";
import { regenererGrilleEdl, type EtatEdl } from "@/app/actions/edl";
import { Button } from "@/components/ui/button";

// Le lot a des pièces mais la grille de cet EDL est restée générique (elle a
// été générée avant leur déclaration) : un clic suffit pour la reconstruire —
// sans repasser par la fiche du lot.
export function BoutonRegenererGrille({
  orgId,
  bailId,
  edlId,
}: {
  orgId: string;
  bailId: string;
  edlId: string;
}) {
  const action = regenererGrilleEdl.bind(null, orgId, bailId, edlId);
  const [etat, formAction, enCours] = useActionState<EtatEdl, FormData>(action, {});

  return (
    <form action={formAction} className="mt-2 space-y-1">
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? "Régénération…" : "Régénérer la grille depuis les pièces du lot"}
      </Button>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
    </form>
  );
}
