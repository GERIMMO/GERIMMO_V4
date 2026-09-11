"use client";

import { useActionState } from "react";
import {
  demarrerAbonnement,
  ouvrirPortailAbonnement,
  type EtatAbonnementAction,
} from "@/app/actions/abonnement";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

// Les deux gestes de l'abonnement. Ils partent vers Stripe : en cas de succès,
// l'action REDIRIGE et ce composant ne revoit jamais la main — seul l'échec
// remonte ici, et il remonte en français.

export function BoutonSouscrire({ orgId, libelle }: { orgId: string; libelle: string }) {
  const [etat, action] = useActionState<EtatAbonnementAction, FormData>(
    demarrerAbonnement.bind(null, orgId),
    {}
  );
  return (
    <form action={action} className="space-y-2">
      <BoutonEnvoi enCoursTexte="Ouverture du paiement…">{libelle}</BoutonEnvoi>
      {etat.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
    </form>
  );
}

export function BoutonPortail({ orgId }: { orgId: string }) {
  const [etat, action] = useActionState<EtatAbonnementAction, FormData>(
    ouvrirPortailAbonnement.bind(null, orgId),
    {}
  );
  return (
    <form action={action} className="space-y-2">
      <BoutonEnvoi variant="outline" enCoursTexte="Ouverture…">
        Gérer mon abonnement
      </BoutonEnvoi>
      {etat.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
    </form>
  );
}
