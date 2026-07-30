"use client";

import { useActionState, useRef, useEffect } from "react";
import { deposerDocument, type EtatDepot } from "@/app/actions/ged";
import { TYPES_DEPOSABLES, TYPES_DOCUMENT } from "@/lib/ged";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Personne = { id: string; nom: string; prenom: string | null };

export function FormulaireDepot({
  orgId,
  personnes,
}: {
  orgId: string;
  personnes: Personne[];
}) {
  const actionLiee = deposerDocument.bind(null, orgId);
  const [etat, action, enCours] = useActionState<EtatDepot, FormData>(
    actionLiee,
    {}
  );
  const formulaire = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (etat.succes) formulaire.current?.reset();
  }, [etat]);

  return (
    <form ref={formulaire} action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fichier">Fichier</Label>
        <Input
          id="fichier"
          name="fichier"
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="type-depot">Type de document</Label>
        <select
          id="type-depot"
          name="type"
          required
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {TYPES_DEPOSABLES.map((t) => (
            <option key={t} value={t}>
              {TYPES_DOCUMENT[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="titre">Titre (facultatif)</Label>
        <Input id="titre" name="titre" type="text" maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="personne">Rattacher à une personne (facultatif)</Label>
        <select
          id="personne"
          name="personne"
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="">— Agence seulement —</option>
          {personnes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nom} {p.prenom ?? ""}
            </option>
          ))}
        </select>
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && (
        <p className="text-sm text-success-soft-foreground">
          {etat.succes}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={enCours}>
        {enCours ? "Dépôt…" : "Déposer"}
      </Button>
    </form>
  );
}
