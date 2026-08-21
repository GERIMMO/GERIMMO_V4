"use client";

import { useActionState } from "react";
import { modifierBail, type EtatBail } from "@/app/actions/baux";
import { Button } from "@/components/ui/button";
import { ChampsBail, type BailDefauts } from "@/components/champs-bail";

type Personne = { id: string; nom: string; prenom: string | null };

// Corriger un brouillon de bail (recette 21/08) : la saisie initiale se
// reprend champ par champ tant que le bail n'est pas parti à la signature.
export function FormulaireEditionBail({
  orgId,
  bailId,
  personnes,
  defauts,
}: {
  orgId: string;
  bailId: string;
  personnes: Personne[];
  defauts: BailDefauts;
}) {
  const action = modifierBail.bind(null, orgId, bailId);
  const [etat, formAction, enCours] = useActionState<EtatBail, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      <ChampsBail personnes={personnes} defauts={defauts} prefixe="edition" />
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "Enregistrement…" : "Enregistrer les corrections"}
      </Button>
    </form>
  );
}
