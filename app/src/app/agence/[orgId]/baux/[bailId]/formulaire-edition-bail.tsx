"use client";

import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { modifierBail, type EtatBail } from "@/app/actions/baux";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { ChampsBail, type BailDefauts } from "@/components/champs-bail";

type Personne = { id: string; nom: string; prenom: string | null };

// Corriger un brouillon de bail (recette 21/08) : la saisie initiale se
// reprend champ par champ tant que le bail n'est pas parti à la signature.
export function FormulaireEditionBail({
  orgId,
  bailId,
  personnes,
  chambres,
  defauts,
}: {
  orgId: string;
  bailId: string;
  personnes: Personne[];
  chambres?: { id: string; nom: string }[];
  defauts: BailDefauts;
}) {
  const action = modifierBail.bind(null, orgId, bailId);
  const { etat, soumettre: formAction, enCours } = useActionFormulaire<EtatBail>(action);

  return (
    <form onSubmit={formAction} className="space-y-3">
      {/* etat.valeurs prime sur les défauts du brouillon : un refus ne doit pas
          écraser les corrections saisies (recette 22/08). */}
      <ChampsBail chambres={chambres} personnes={personnes} defauts={defauts} prefixe="edition" valeurs={etat.valeurs} />
      {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
      <BoutonEnvoi enCours={enCours} enCoursTexte="Enregistrement…" size="sm" variant="outline">
        Enregistrer les corrections
      </BoutonEnvoi>
    </form>
  );
}
