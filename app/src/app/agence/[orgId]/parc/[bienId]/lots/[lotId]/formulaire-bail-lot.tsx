"use client";

import { useActionState } from "react";
import { creerBail, type EtatBail } from "@/app/actions/baux";
import { Button } from "@/components/ui/button";
import { ChampsBail } from "@/components/champs-bail";

type Personne = { id: string; nom: string; prenom: string | null };

export function FormulaireBailLot({
  orgId,
  bienId,
  lotId,
  personnes,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  personnes: Personne[];
}) {
  const action = creerBail.bind(null, orgId, lotId, bienId);
  const [etat, formAction, enCours] = useActionState<EtatBail, FormData>(action, {});

  return (
    <form action={formAction} className="space-y-3">
      {/* etat.valeurs : en erreur, la saisie du bail est reposée (recette 22/08) */}
      <ChampsBail personnes={personnes} valeurs={etat.valeurs} />
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      <Button type="submit" size="sm" disabled={enCours}>
        {enCours ? "Création…" : "Créer le bail"}
      </Button>
    </form>
  );
}
