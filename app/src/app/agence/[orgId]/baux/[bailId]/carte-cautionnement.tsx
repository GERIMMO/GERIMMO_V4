"use client";

import { useState } from "react";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Génération de l'acte de cautionnement : un acte par garant du bail, avec
// les choix du geste (forme solidaire ou simple, plafond garanti en euros).
// Le plafond est exigé à peine de nullité de l'engagement — laissé vide, il
// reste en libellé d'épreuve dans le PDF et remonte dans les manquants.
export function CarteCautionnement({
  orgId,
  bailId,
  garants,
}: {
  orgId: string;
  bailId: string;
  garants: { id: string; nom: string }[];
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        Depuis 2022, la mention type peut être dactylographiée : le PDF
        l&apos;imprime dans un encadré que la caution appose elle-même avant de
        signer. La forme solidaire permet de poursuivre la caution sans
        discuter d&apos;abord le locataire.
      </p>
      <div className="divide-y divide-border">
        {garants.map((g) => (
          <LigneGarant key={g.id} orgId={orgId} bailId={bailId} garant={g} />
        ))}
      </div>
    </div>
  );
}

function LigneGarant({
  orgId,
  bailId,
  garant,
}: {
  orgId: string;
  bailId: string;
  garant: { id: string; nom: string };
}) {
  const [forme, setForme] = useState<"solidaire" | "simple">("solidaire");
  const [montantMax, setMontantMax] = useState("");

  return (
    <div className="space-y-2 py-3">
      <p className="text-sm font-medium">{garant.nom}</p>
      <div className="grid gap-2 sm:grid-cols-3 sm:items-end">
        <div className="space-y-1">
          <Label htmlFor={`caut-forme-${garant.id}`} className="text-xs">
            Forme
          </Label>
          <select
            id={`caut-forme-${garant.id}`}
            value={forme}
            onChange={(e) => setForme(e.target.value === "simple" ? "simple" : "solidaire")}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="solidaire">Caution solidaire</option>
            <option value="simple">Caution simple</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`caut-plafond-${garant.id}`} className="text-xs">
            Montant maximal garanti (€)
          </Label>
          <Input
            id={`caut-plafond-${garant.id}`}
            type="number"
            min="0"
            step="0.01"
            placeholder="ex. 15000"
            value={montantMax}
            onChange={(e) => setMontantMax(e.target.value)}
          />
        </div>
        <div className="pb-0.5">
          <BoutonGenererDocument
            orgId={orgId}
            code="cautionnement"
            cibleId={bailId}
            cheminRetour={`/agence/${orgId}/baux/${bailId}`}
            libelle="Générer l'acte"
            options={{
              garant: garant.id,
              forme,
              ...(montantMax.trim() ? { montant_max: montantMax.trim() } : {}),
            }}
          />
        </div>
      </div>
    </div>
  );
}
