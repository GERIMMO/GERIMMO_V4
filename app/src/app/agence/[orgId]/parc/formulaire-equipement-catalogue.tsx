"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { ajouterEquipementCatalogue, type EtatParc } from "@/app/actions/parc";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormulaireEquipementCatalogue({ orgId }: { orgId: string }) {
  const actionLiee = ajouterEquipementCatalogue.bind(null, orgId);
  const [etat, action] = useActionState<EtatParc, FormData>(actionLiee, {});
  const formulaire = useRef<HTMLFormElement>(null);
  // Champ et bouton sur la même ligne : le libellé ne s'adresse qu'à la
  // synthèse vocale, pour ne pas décaler le bouton. Identifiant tiré de
  // useId(), jamais en dur : le formulaire peut être rendu deux fois.
  const idNom = useId();

  useEffect(() => {
    if (etat.succes) formulaire.current?.reset();
  }, [etat]);

  return (
    <form ref={formulaire} action={action} className="flex flex-wrap items-center gap-2">
      {/* En erreur (doublon…), la saisie est reposée via etat.valeurs (recette 22/08) */}
      <Label htmlFor={idNom} className="sr-only">
        Nom de l&apos;équipement
      </Label>
      <Input
        id={idNom}
        name="nom"
        required
        maxLength={80}
        placeholder="Nouvel équipement (ex. Réfrigérateur)"
        className="max-w-xs"
        defaultValue={etat.valeurs?.nom}
      />
      <BoutonEnvoi size="sm" variant="outline" enCoursTexte="Ajout…">
        Ajouter au catalogue
      </BoutonEnvoi>
      {etat.erreur && <p className="w-full text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && (
        <p className="w-full text-sm text-success-soft-foreground">{etat.succes}</p>
      )}
    </form>
  );
}
