"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

// « Copier » l'IBAN de l'agence (24/09) : recopié à la main depuis un
// téléphone, un chiffre sur vingt-sept finit toujours par sauter. Le bouton dit
// lui-même ce qui s'est passé — l'espace locataire n'a pas de zone de toast.
export function BoutonCopierIban({ iban }: { iban: string }) {
  const [etat, setEtat] = useState<"repos" | "copie" | "echec">("repos");

  useEffect(() => {
    if (etat === "repos") return;
    const minuterie = window.setTimeout(() => setEtat("repos"), 2500);
    return () => window.clearTimeout(minuterie);
  }, [etat]);

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(iban);
      setEtat("copie");
    } catch {
      // Presse-papiers refusé (page non sécurisée, permission) : l'IBAN reste
      // affiché juste à côté, on le dit plutôt que de faire croire à la copie.
      setEtat("echec");
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={copier} aria-live="polite">
      {etat === "copie" ? "IBAN copié ✓" : etat === "echec" ? "Copie impossible" : "Copier"}
    </Button>
  );
}
