"use client";

import { Button } from "@/components/ui/button";

// Impression du document affiché (quittance, attestation…) — masqué à l'impression.
export function BoutonImprimer({ libelle = "Imprimer" }: { libelle?: string }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="print:hidden"
      onClick={() => window.print()}
    >
      {libelle}
    </Button>
  );
}
