"use client";

import { useState, useTransition } from "react";
import { ouvrirDocument } from "@/app/actions/ged";
import { Button } from "@/components/ui/button";

// Consultation / téléchargement : chaque clic obtient un lien signé éphémère
// (60 s) après traçage de l'accès — jamais d'URL directe ni permanente.
export function ActionsDocument({
  orgId,
  documentId,
}: {
  orgId: string;
  documentId: string;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  function ouvrir(mode: "consultation" | "telechargement") {
    setErreur(null);
    demarrer(async () => {
      const resultat = await ouvrirDocument(orgId, documentId, mode);
      if (resultat.erreur) {
        setErreur(resultat.erreur);
        return;
      }
      if (resultat.url) {
        if (mode === "consultation") window.open(resultat.url, "_blank");
        else window.location.assign(resultat.url);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {erreur && <span className="text-xs text-destructive">{erreur}</span>}
      <Button
        variant="ghost"
        size="sm"
        disabled={enCours}
        onClick={() => ouvrir("consultation")}
      >
        Consulter
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={enCours}
        onClick={() => ouvrir("telechargement")}
      >
        Télécharger
      </Button>
    </div>
  );
}
