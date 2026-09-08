"use client";

import { useState, useTransition } from "react";
import { envoyerPourSignature } from "@/app/actions/signature";
import { Button } from "@/components/ui/button";
import { afficherToast } from "@/components/ui/toast";

// « Envoyer pour signature » (chantier documentaire 08/09) : le document part
// dans « À signer » de l'espace du signataire ; il le télécharge, le signe et
// dépose le PDF signé — le retour vous alerte. La signature en ligne
// (Yousign) arrive plus tard : d'ici là, le circuit est celui du signé déposé.
export function BoutonEnvoyerSignature({
  orgId,
  documentId,
  // Les personnes rattachées au document (une seule : pas de choix à faire)
  signataires,
}: {
  orgId: string;
  documentId: string;
  signataires: { id: string; nom: string }[];
}) {
  const [enCours, demarrer] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);
  const [choix, setChoix] = useState(signataires[0]?.id ?? "");

  if (signataires.length === 0) return null;

  function envoyer() {
    if (!choix) return;
    demarrer(async () => {
      const res = await envoyerPourSignature(orgId, documentId, choix);
      setErreur(res.erreur ?? null);
      if (res.succes) afficherToast(res.succes);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {signataires.length > 1 && (
        <select
          value={choix}
          onChange={(e) => setChoix(e.target.value)}
          aria-label="Signataire"
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {signataires.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nom}
            </option>
          ))}
        </select>
      )}
      <Button type="button" size="sm" variant="outline" disabled={enCours} onClick={envoyer}>
        {enCours ? "Envoi…" : "Envoyer pour signature"}
      </Button>
      {erreur && <span className="text-xs text-destructive">{erreur}</span>}
    </div>
  );
}
