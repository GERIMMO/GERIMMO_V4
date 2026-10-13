"use client";

import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { marquerDevisTraitee, type EtatDevisAdmin } from "@/app/actions/devis-admin";

export function BoutonDevisTraite({ id }: { id: string }) {
  const [etat, action] = useActionState<EtatDevisAdmin, FormData>(
    marquerDevisTraitee.bind(null, id),
    {}
  );
  return (
    <form data-saisie-confirmee action={action} className="flex items-center gap-2">
      <BoutonEnvoi size="sm" variant="outline" enCoursTexte="…">
        Marquer traitée
      </BoutonEnvoi>
      {etat.erreur && <span role="alert" className="text-xs text-destructive">{etat.erreur}</span>}
      {etat.succes && <span role="status" className="text-xs">{etat.succes}</span>}
    </form>
  );
}
