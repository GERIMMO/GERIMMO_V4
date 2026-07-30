"use client";

import { useActionState, useEffect, useRef } from "react";
import { creerAlerte, type EtatAlerte } from "@/app/actions/alertes";
import { CRITICITES } from "@/lib/ged";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Membre = { account_id: string; email: string; role: string };

export function FormulaireAlerte({
  orgId,
  membres,
}: {
  orgId: string;
  membres: Membre[];
}) {
  const actionLiee = creerAlerte.bind(null, orgId);
  const [etat, action, enCours] = useActionState<EtatAlerte, FormData>(
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
        <Label htmlFor="titre-alerte">Titre</Label>
        <Input id="titre-alerte" name="titre" required maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="criticite">Criticité</Label>
        <select
          id="criticite"
          name="criticite"
          defaultValue="normale"
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {Object.entries(CRITICITES).map(([valeur, libelle]) => (
            <option key={valeur} value={valeur}>
              {libelle}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Une alerte informative ne s&apos;escalade jamais.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="echeance">Échéance (facultatif)</Label>
        <Input id="echeance" name="echeance" type="date" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="assignee">Assigner à (facultatif)</Label>
        <select
          id="assignee"
          name="assignee"
          defaultValue=""
          className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="">— Personne —</option>
          {membres.map((m) => (
            <option key={m.account_id} value={m.account_id}>
              {m.email}
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
        {enCours ? "Création…" : "Créer l'alerte"}
      </Button>
    </form>
  );
}
