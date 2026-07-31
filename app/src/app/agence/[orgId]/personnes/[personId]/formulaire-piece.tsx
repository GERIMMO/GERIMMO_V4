"use client";

import { useActionState, useEffect, useRef } from "react";
import { deposerPieceDossier, type EtatDossier } from "@/app/actions/dossier";
import { TYPES_PIECE_DOSSIER } from "@/lib/dossier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormulairePiece({ orgId, personId }: { orgId: string; personId: string }) {
  const action = deposerPieceDossier.bind(null, orgId, personId);
  const [etat, formAction, enCours] = useActionState<EtatDossier, FormData>(action, {});
  const formulaire = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (etat.succes) formulaire.current?.reset();
  }, [etat]);

  return (
    <form
      ref={formulaire}
      action={formAction}
      className="flex flex-wrap items-end gap-2 border-t border-border pt-4"
    >
      <div className="w-44 space-y-1.5">
        <Label htmlFor="piece-type" className="text-xs">
          Type de pièce
        </Label>
        <select
          id="piece-type"
          name="type"
          required
          defaultValue="piece_identite"
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {Object.entries(TYPES_PIECE_DOSSIER).map(([valeur, libelle]) => (
            <option key={valeur} value={valeur}>
              {libelle}
            </option>
          ))}
        </select>
      </div>
      <div className="min-w-40 flex-1 space-y-1.5">
        <Label htmlFor="piece-titre" className="text-xs">
          Titre
        </Label>
        <Input id="piece-titre" name="titre" maxLength={200} placeholder="ex. CNI recto-verso" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="piece-fichier" className="text-xs">
          Fichier (PDF/JPG/PNG, 10 Mo)
        </Label>
        <Input id="piece-fichier" name="fichier" type="file" accept=".pdf,.jpg,.jpeg,.png" required />
      </div>
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? "Dépôt…" : "Déposer"}
      </Button>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && (
        <p className="w-full text-sm text-success-soft-foreground">{etat.succes}</p>
      )}
    </form>
  );
}
