"use client";

import { useId, useState } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { remplacerDocument, type EtatDocumentGed } from "@/app/actions/documents-ged";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChampFichier } from "@/components/champ-fichier";

// « Remplacer » (maquette pageDocument) : nouvelle version de la pièce, même
// type, rattachements conservés — l'historique reste consultable sur la fiche.
export function FormulaireRemplacer({
  orgId,
  documentId,
  expireLe,
  integre = false,
  onFermer,
  retourFiltres,
}: {
  orgId: string;
  documentId: string;
  // L'échéance de la version remplacée, proposée en pré-remplissage : une
  // pièce renouvelée porte sa NOUVELLE date, pas l'ancienne (revue 26/08)
  expireLe: string | null;
  integre?: boolean;
  onFermer?: () => void;
  retourFiltres?: string;
}) {
  const identifiant = useId();
  const [ouvert, setOuvert] = useState(false);
  const actionLiee = remplacerDocument.bind(null, orgId, documentId);
  const [etat, action] = useActionState<EtatDocumentGed, FormData>(
    actionLiee,
    {}
  );

  if (!integre && !ouvert) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOuvert(true)}>
        Remplacer
      </Button>
    );
  }

  return (
    <form data-saisie-confirmee action={action} className={integre ? "w-full space-y-4" : "w-full space-y-3 rounded-md border border-border p-3"}>
      {retourFiltres && <input type="hidden" name="retour_filtres" value={retourFiltres} />}
      <p className="text-sm text-muted-foreground">
        {integre
          ? "L’historique et les liens avec vos fiches sont conservés."
          : "Le remplacement conserve l’historique : l’ancienne version reste tracée, la nouvelle reprend le type et les rattachements."}
      </p>
      <div className="space-y-2">
        <Label htmlFor={`${identifiant}-fichier`}>Nouvelle version</Label>
        <ChampFichier depotDirect id={`${identifiant}-fichier`} name="fichier" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${identifiant}-titre`}>Nouveau titre (facultatif)</Label>
        <Input
          id={`${identifiant}-titre`}
          name="titre"
          type="text"
          maxLength={200}
          className={integre ? "min-h-11" : undefined}
          defaultValue={etat.valeurs?.titre}
        />
      </div>
      {expireLe !== null && (
        <div className="space-y-2">
          <Label htmlFor={`${identifiant}-expiration`}>Nouvelle date d&apos;expiration</Label>
          <Input
            id={`${identifiant}-expiration`}
            name="expire_le"
            type="date"
            className={integre ? "min-h-11" : undefined}
            defaultValue={etat.valeurs?.expire_le ?? expireLe}
          />
        </div>
      )}
      {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
      <div className="flex flex-wrap gap-2">
        <BoutonEnvoi size="sm" className={integre ? "min-h-11" : undefined} enCoursTexte="Envoi…">
          {integre ? "Ajouter une nouvelle version" : "Déposer la nouvelle version"}
        </BoutonEnvoi>
        <Button type="button" variant="ghost" size="sm" className={integre ? "min-h-11" : undefined} onClick={() => {
          if (integre) onFermer?.();
          else setOuvert(false);
        }}>
          {integre ? "Fermer" : "Annuler"}
        </Button>
      </div>
    </form>
  );
}
