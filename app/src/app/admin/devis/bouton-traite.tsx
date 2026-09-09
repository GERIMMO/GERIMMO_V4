"use client";

import { useActionState } from "react";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { marquerDevisTraitee, type EtatDevisAdmin } from "@/app/actions/devis-admin";

export function BoutonDevisTraite({ id }: { id: string }) {
  const [etat, action] = useActionState<EtatDevisAdmin, FormData>(
    marquerDevisTraitee.bind(null, id),
    {}
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <BoutonEnvoi size="sm" variant="outline" enCoursTexte="…">
        Marquer traitée
      </BoutonEnvoi>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
    </form>
  );
}
