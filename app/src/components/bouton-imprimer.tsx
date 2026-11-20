"use client";

import { Button } from "@/components/ui/button";

// Impression du document affiché (quittance, attestation…) — masqué à l'impression.
// Sur la page d'un document, imprimer est L'action de l'écran : bouton principal (Design System « Maison », 20/11).
export function BoutonImprimer({ libelle = "Imprimer" }: { libelle?: string }) {
  return (
    <Button
      type="button"
      size="sm"
      className="print:hidden"
      onClick={() => window.print()}
    >
      {libelle}
    </Button>
  );
}
