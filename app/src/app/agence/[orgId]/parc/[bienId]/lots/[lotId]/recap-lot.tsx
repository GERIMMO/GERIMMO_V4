"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formaterSurface } from "@/lib/parc";
import { FaitsFiche, type Fait } from "@/components/fiche-parc";
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

  // Le propriétaire et le locataire ont leur propre bloc sur la fiche : ils ne
  // sont pas des caractéristiques du logement. `null` = non renseigné, réuni en
  // une phrase par FaitsFiche — neuf rangées dont quatre tirets occupaient un
  // tiers de l'écran d'un téléphone pour ne rien dire (relevé du 11/09).
  const faits: Fait[] = [
    { libelle: "Surface", valeur: lot.surface_m2 !== null ? formaterSurface(lot.surface_m2) : null },
    {
      libelle: "Surface Carrez",
      valeur: lot.surface_carrez !== null ? formaterSurface(lot.surface_carrez) : null,
    },
    { libelle: "Pièces", valeur: lot.pieces !== null ? String(lot.pieces) : null },
    { libelle: "Étage", valeur: lot.etage || null },
    { libelle: "Meublé", valeur: lot.meuble ? "Oui" : "Non" },
    {
      libelle: "Tantième de copropriété",
      valeur: lot.tantieme !== null ? String(lot.tantieme) : null,
    },
    // Recette 21/08 : visible sans ouvrir « Modifier le lot »
    { libelle: "Identifiant fiscal", valeur: lot.identifiant_fiscal || null },
  ];

  return (
    <div className="space-y-3">
      <FaitsFiche faits={faits} />
      {lot.description && (
        <p className="text-sm text-muted-foreground">{lot.description}</p>
      )}
      <Button variant="outline" size="sm" onClick={() => setModifier(true)}>
        Modifier le lot
      </Button>
    </div>
  );
}
