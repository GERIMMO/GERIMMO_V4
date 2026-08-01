"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TYPES_BIEN } from "@/lib/parc";
import { FormulaireBien, type BienFormulaire } from "../formulaire-bien";

// Condensé du bien (consultation) + bascule vers l'édition (« Modifier le bien »).
// Même logique que RecapLot côté lot : on consulte d'abord, on édite sur clic.
export function RecapBien({
  orgId,
  bien,
  nbLots,
}: {
  orgId: string;
  bien: BienFormulaire;
  nbLots: number;
}) {
  const [modifier, setModifier] = useState(false);

  if (modifier) {
    return (
      <div className="space-y-3">
        <FormulaireBien orgId={orgId} bien={bien} />
        <Button variant="ghost" size="sm" onClick={() => setModifier(false)}>
          Fermer l&apos;édition
        </Button>
      </div>
    );
  }

  const adresse = [
    bien.address_line1,
    bien.address_line2,
    `${bien.postal_code} ${bien.city}`,
  ]
    .filter(Boolean)
    .join(", ");

  const lignes: [string, string][] = [
    ["Type", TYPES_BIEN[bien.type] ?? bien.type],
    ["Adresse", adresse],
    ["Année de construction", bien.annee_construction ? String(bien.annee_construction) : "—"],
    ["Copropriété", bien.copropriete ? "Oui" : "Non"],
    ["Zone tendue", bien.zone_tendue ? "Oui" : "Non"],
    ["Nombre de lots", String(nbLots)],
  ];

  return (
    <div className="space-y-3">
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {lignes.map(([label, valeur]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-border/60 py-1">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{valeur}</dd>
          </div>
        ))}
      </dl>
      <Button variant="outline" size="sm" onClick={() => setModifier(true)}>
        Modifier le bien
      </Button>
    </div>
  );
}
