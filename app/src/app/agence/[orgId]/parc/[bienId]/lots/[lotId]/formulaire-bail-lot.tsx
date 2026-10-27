"use client";
import { useActionState } from "react";
import { commencerBail } from "@/app/actions/etapes-bail";
import type { EtatBail } from "@/app/actions/baux";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

export function FormulaireBailLot({ orgId, bienId, lotId, compact = false }: {
  compact?: boolean;
  parcours?: boolean;
  orgId: string;
  bienId: string;
  lotId: string;
  personnes: { id: string; nom: string; prenom: string | null }[];
  chambres?: { id: string; nom: string }[];
}) {
  // L'action serveur crée puis redirige ; le formulaire reste en attente
  // jusqu'à l'ouverture du parcours, sans étape « Ouvrir le brouillon ».
  const [etat, action] = useActionState<EtatBail, FormData>(
    commencerBail.bind(null, orgId, lotId, bienId), {},
  );
  return <form data-saisie-libre action={action} className="space-y-3">
    {!compact && <p className="text-sm text-muted-foreground">Préparez le contrat à partir des informations déjà enregistrées pour ce logement.</p>}
    {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
    <BoutonEnvoi className={compact ? "w-full" : undefined} enCoursTexte="Ouverture du parcours…">
      {compact ? "Commencer un bail" : "Commencer le bail"}
    </BoutonEnvoi>
  </form>;
}
