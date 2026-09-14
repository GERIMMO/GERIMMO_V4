"use client";

import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { creerBail, type EtatBail } from "@/app/actions/baux";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { ChampsBail } from "@/components/champs-bail";

type Personne = { id: string; nom: string; prenom: string | null };

export function FormulaireBailLot({
  orgId,
  bienId,
  lotId,
  personnes,
  chambres,
}: {
  orgId: string;
  bienId: string;
  lotId: string;
  personnes: Personne[];
  chambres?: { id: string; nom: string }[];
}) {
  const action = creerBail.bind(null, orgId, lotId, bienId);
  const router = useRouter();
  const { etat, soumettre: formAction, enCours } = useActionFormulaire<EtatBail>(async (precedent, donnees) => {
    const retour = await action(precedent, donnees);
    if (retour.bailCree) router.push(`/agence/${orgId}/baux/${retour.bailCree}`);
    return retour;
  });

  return (
    <form onSubmit={formAction} className="space-y-3">
      {/* etat.valeurs : en erreur, la saisie du bail est reposée (recette 22/08) */}
      <ChampsBail chambres={chambres} personnes={personnes} valeurs={etat.valeurs} />
      {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.bailCree && <p role="status" className="text-sm text-success-soft-foreground">
        Brouillon créé. <Link className="underline" href={`/agence/${orgId}/baux/${etat.bailCree}`}>Ouvrir le bail</Link>
      </p>}
      <BoutonEnvoi size="sm" enCours={enCours} disabled={Boolean(etat.bailCree)} enCoursTexte="Création…">
        Créer le bail
      </BoutonEnvoi>
    </form>
  );
}
