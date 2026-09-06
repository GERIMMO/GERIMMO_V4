"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { marquerDevisTraitee, type EtatDevisAdmin } from "@/app/actions/devis-admin";

export function BoutonDevisTraite({ id }: { id: string }) {
  const [etat, action, enCours] = useActionState<EtatDevisAdmin, FormData>(
    marquerDevisTraitee.bind(null, id),
    {}
  );
  return (
    <form action={action} className="flex items-center gap-2">
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "…" : "Marquer traitée"}
      </Button>
      {etat.erreur && <span className="text-xs text-destructive">{etat.erreur}</span>}
    </form>
  );
}
