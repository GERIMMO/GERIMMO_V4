"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formaterSurface } from "@/lib/parc";
import { FormulaireLot, type LotFormulaire } from "./formulaire-lot";

export function RecapLot({
  orgId,
  bienId,
  lot,
  verrouille,
}: {
  orgId: string;
  bienId: string;
  lot: LotFormulaire;
  verrouille: boolean;
}) {
  const [modifier, setModifier] = useState(false);

  if (modifier) {
    return (
      <div className="space-y-3">
        {verrouille && (
          <p className="text-xs text-warning-soft-foreground">
            Lot loué : surface et pièces verrouillées, modification par avenant au
            bail (RM-0.5.1).
          </p>
        )}
        <FormulaireLot orgId={orgId} bienId={bienId} lot={lot} verrouille={verrouille} />
        <Button variant="ghost" size="sm" onClick={() => setModifier(false)}>
          Fermer l&apos;édition
        </Button>
      </div>
    );
  }

  const lignes: [string, string][] = [
    ["Surface", lot.surface_m2 !== null ? formaterSurface(lot.surface_m2) : "—"],
    ["Surface Carrez", lot.surface_carrez !== null ? formaterSurface(lot.surface_carrez) : "—"],
    ["Pièces", lot.pieces !== null ? String(lot.pieces) : "—"],
    ["Étage", lot.etage || "—"],
    ["Meublé", lot.meuble ? "Oui" : "Non"],
    ["Tantième de copropriété", lot.tantieme !== null ? String(lot.tantieme) : "—"],
  ];

  return (
    <div className="space-y-3">
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {lignes.map(([label, valeur]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{valeur}</dd>
          </div>
        ))}
      </dl>
      {lot.description && (
        <p className="text-sm text-muted-foreground">{lot.description}</p>
      )}
      <Button variant="outline" size="sm" onClick={() => setModifier(true)}>
        Modifier le lot
      </Button>
    </div>
  );
}
