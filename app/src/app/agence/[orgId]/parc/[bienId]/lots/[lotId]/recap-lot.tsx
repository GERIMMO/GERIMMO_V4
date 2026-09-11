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
  proprietaires,
  locataire,
}: {
  orgId: string;
  bienId: string;
  lot: LotFormulaire;
  verrouille: boolean;
  // Recette 21/08 : le lot se lit d'un coup d'œil — qui le possède, qui
  // l'occupe — sans parcourir les sections.
  proprietaires?: string;
  locataire?: string;
}) {
  const [modifier, setModifier] = useState(false);

  if (modifier) {
    return (
      <div className="space-y-3">
        {verrouille && (
          <p className="text-xs text-warning-soft-foreground">
            Lot loué : surface et pièces verrouillées, modification par avenant au
            bail.
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
    ["Propriétaire", proprietaires || "—"],
    ["Locataire", locataire || "—"],
    ["Surface", lot.surface_m2 !== null ? formaterSurface(lot.surface_m2) : "—"],
    ["Surface Carrez", lot.surface_carrez !== null ? formaterSurface(lot.surface_carrez) : "—"],
    ["Pièces", lot.pieces !== null ? String(lot.pieces) : "—"],
    ["Étage", lot.etage || "—"],
    ["Meublé", lot.meuble ? "Oui" : "Non"],
    ["Tantième de copropriété", lot.tantieme !== null ? String(lot.tantieme) : "—"],
    // Recette 21/08 : visible sans ouvrir « Modifier le lot »
    ["Identifiant fiscal", lot.identifiant_fiscal || "—"],
  ];

  return (
    <div className="space-y-3">
      {/* .ligne-info : la rangée « libellé ↔ valeur » de la charte, au lieu
          du flex + border-b remonté à la main sur chaque fiche. */}
      <dl className="grid gap-x-6 sm:grid-cols-2">
        {lignes.map(([label, valeur]) => (
          <div key={label} className="ligne-info">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{valeur}</dd>
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
