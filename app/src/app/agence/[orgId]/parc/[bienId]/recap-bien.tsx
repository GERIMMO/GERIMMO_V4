"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FaitsFiche, type Fait } from "@/components/fiche-parc";
import { FormulaireBien, type BienFormulaire } from "../formulaire-bien";

// Condensé du bien (consultation) + bascule vers l'édition (« Modifier le bien »).
// Même logique que RecapLot côté lot : on consulte d'abord, on édite sur clic.
export function RecapBien({
  orgId,
  bien,
}: {
  orgId: string;
  bien: BienFormulaire;
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

  // Le type, l'adresse et le nombre de lots sont déjà dans l'en-tête de la
  // fiche : les répéter ici ne fait que trois lignes de plus à traverser.
  // `null` = non renseigné : FaitsFiche réunit ces champs en une phrase au lieu
  // d'une colonne de tirets (relevé du 11/09).
  const faits: Fait[] = [
    { libelle: "Adresse", valeur: adresse },
    {
      libelle: "Année de construction",
      valeur: bien.annee_construction ? String(bien.annee_construction) : null,
    },
    { libelle: "Copropriété", valeur: bien.copropriete ? "Oui" : "Non" },
    { libelle: "Zone tendue", valeur: bien.zone_tendue ? "Oui" : "Non" },
  ];

  return (
    <div className="space-y-3">
      <FaitsFiche faits={faits} />
      <Button variant="outline" size="sm" onClick={() => setModifier(true)}>
        Modifier le bien
      </Button>
    </div>
  );
}
