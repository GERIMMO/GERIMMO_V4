"use client";

import { useActionState, useState } from "react";
import { remplacerDocument, type EtatDocumentGed } from "@/app/actions/documents-ged";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// « Remplacer » (maquette pageDocument) : nouvelle version de la pièce, même
// type, rattachements conservés — l'historique reste consultable sur la fiche.
export function FormulaireRemplacer({
  orgId,
  documentId,
  expireLe,
}: {
  orgId: string;
  documentId: string;
  // L'échéance de la version remplacée, proposée en pré-remplissage : une
  // pièce renouvelée porte sa NOUVELLE date, pas l'ancienne (revue 26/08)
  expireLe: string | null;
}) {
  const [ouvert, setOuvert] = useState(false);
  const actionLiee = remplacerDocument.bind(null, orgId, documentId);
  const [etat, action, enCours] = useActionState<EtatDocumentGed, FormData>(
    actionLiee,
    {}
  );

  if (!ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
        Remplacer
      </Button>
    );
  }

  return (
    <form action={action} className="w-full space-y-3 rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">
        Le remplacement conserve l&apos;historique : l&apos;ancienne version reste
        tracée, la nouvelle reprend le type et les rattachements.
      </p>
      <div className="space-y-2">
        <Label htmlFor="fichier-remplacement">Nouvelle version</Label>
        <Input
          id="fichier-remplacement"
          name="fichier"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="titre-remplacement">Nouveau titre (facultatif)</Label>
        <Input
          id="titre-remplacement"
          name="titre"
          type="text"
          maxLength={200}
          defaultValue={etat.valeurs?.titre}
        />
      </div>
      {expireLe !== null && (
        <div className="space-y-2">
          <Label htmlFor="expire-remplacement">Nouvelle date d&apos;expiration</Label>
          <Input
            id="expire-remplacement"
            name="expire_le"
            type="date"
            defaultValue={etat.valeurs?.expire_le ?? expireLe}
          />
        </div>
      )}
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={enCours}>
          {enCours ? "Remplacement…" : "Déposer la nouvelle version"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
