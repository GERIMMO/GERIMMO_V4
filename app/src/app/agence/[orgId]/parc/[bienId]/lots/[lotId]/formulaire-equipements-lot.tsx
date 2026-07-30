"use client";

import { useActionState } from "react";
import { definirEquipementsLot, type EtatParc } from "@/app/actions/parc";
import { Button } from "@/components/ui/button";

type Equipement = { id: string; nom: string };

export function FormulaireEquipementsLot({
  orgId,
  bienId,
  lotId,
  catalogue,
  selection,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  catalogue: Equipement[];
  selection: string[];
}) {
  const actionLiee = definirEquipementsLot.bind(null, orgId, bienId, lotId);
  const [etat, action, enCours] = useActionState<EtatParc, FormData>(actionLiee, {});
  const coches = new Set(selection);

  if (catalogue.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Le catalogue de l&apos;agence est vide — l&apos;admin l&apos;alimente
        depuis la page Parc.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {catalogue.map((e) => (
          <label key={e.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="equipement_id"
              value={e.id}
              defaultChecked={coches.has(e.id)}
              className="size-4"
            />
            {e.nom}
          </label>
        ))}
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && (
        <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
      )}
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer les équipements"}
      </Button>
    </form>
  );
}
