"use client";

import { useActionState, useEffect, useRef } from "react";
import { creerPersonne, type EtatPersonne } from "@/app/actions/personnes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormulairePersonne({ orgId }: { orgId: string }) {
  const action = creerPersonne.bind(null, orgId);
  const [etat, formAction, enCours] = useActionState<EtatPersonne, FormData>(action, {});
  const formulaire = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (etat.succes) formulaire.current?.reset();
  }, [etat]);

  return (
    <form ref={formulaire} action={formAction} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="p-nom">Nom *</Label>
        <Input id="p-nom" name="nom" required maxLength={120} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="p-prenom">Prénom</Label>
        <Input id="p-prenom" name="prenom" maxLength={120} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="p-email">Email</Label>
        <Input id="p-email" name="email" type="email" maxLength={200} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="p-tel">Téléphone</Label>
        <Input id="p-tel" name="telephone" maxLength={40} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="p-naissance">Date de naissance</Label>
        <Input id="p-naissance" name="date_naissance" type="date" />
      </div>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && (
        <p className="text-sm text-success-soft-foreground">{etat.succes}</p>
      )}
      <Button type="submit" size="sm" disabled={enCours} className="w-full">
        {enCours ? "Création…" : "Créer la fiche"}
      </Button>
    </form>
  );
}
