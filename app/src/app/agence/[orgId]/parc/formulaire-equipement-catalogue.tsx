"use client";

import { useActionState, useEffect, useRef } from "react";
import { ajouterEquipementCatalogue, type EtatParc } from "@/app/actions/parc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FormulaireEquipementCatalogue({ orgId }: { orgId: string }) {
  const actionLiee = ajouterEquipementCatalogue.bind(null, orgId);
  const [etat, action, enCours] = useActionState<EtatParc, FormData>(actionLiee, {});
  const formulaire = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (etat.succes) formulaire.current?.reset();
  }, [etat]);

  return (
    <form ref={formulaire} action={action} className="flex flex-wrap items-center gap-2">
      <Input
        name="nom"
        required
        maxLength={80}
        placeholder="Nouvel équipement (ex. Réfrigérateur)"
        className="max-w-xs"
      />
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "Ajout…" : "Ajouter au catalogue"}
      </Button>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && (
        <p className="w-full text-sm text-success-soft-foreground">{etat.succes}</p>
      )}
    </form>
  );
}
