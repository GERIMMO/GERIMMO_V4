"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  deposerMonAttestation,
  type EtatAttestation,
} from "@/app/actions/attestation-locataire";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormulaireAttestation({
  orgId,
  renouvellement,
}: {
  orgId: string;
  renouvellement: boolean;
}) {
  const action = deposerMonAttestation.bind(null, orgId);
  const [etat, formAction, enCours] = useActionState<EtatAttestation, FormData>(action, {});
  const formulaire = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (etat.succes) formulaire.current?.reset();
  }, [etat]);

  return (
    <form ref={formulaire} action={formAction} className="space-y-3 border-t border-border pt-4">
      <p className="text-sm font-medium">
        {renouvellement ? "Déposer une nouvelle attestation" : "Déposer mon attestation"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="att-fichier">Fichier (PDF/JPG/PNG)</Label>
          <Input id="att-fichier" name="fichier" type="file" accept=".pdf,.jpg,.jpeg,.png" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="att-expire">Date d&apos;expiration</Label>
          {/* En erreur, la saisie est reposée via etat.valeurs (recette 22/08 —
              le fichier, lui, est à re-choisir). */}
          <Input id="att-expire" name="expire_le" type="date" required defaultValue={etat.valeurs?.expire_le} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="att-titre">Assureur (facultatif)</Label>
          <Input id="att-titre" name="titre" maxLength={200} placeholder="ex. MAIF, contrat n°…" defaultValue={etat.valeurs?.titre} />
        </div>
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? "Dépôt…" : "Déposer"}
      </Button>
    </form>
  );
}
