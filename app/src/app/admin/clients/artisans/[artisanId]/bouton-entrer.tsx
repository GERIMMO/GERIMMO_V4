"use client";

import { useActionState } from "react";
import {
  entrerDansSessionArtisan,
  type EtatSessionArtisan,
} from "@/app/actions/session-artisan";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Le geste demandé le 19/09 : entrer dans la session de l'artisan, pas la
 * regarder. Le motif est FACULTATIF mais proposé d'emblée : il part au journal
 * d'audit avec l'ouverture, et c'est lui qui, six mois plus tard, distinguera
 * une assistance d'un geste inexpliqué.
 */
export function BoutonEntrerSession({ artisanId, nom }: { artisanId: string; nom: string }) {
  const [etat, action] = useActionState<EtatSessionArtisan, FormData>(
    entrerDansSessionArtisan.bind(null, artisanId),
    {}
  );

  return (
    <form action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="motif-session">Motif (facultatif, inscrit au journal d&apos;audit)</Label>
        <Input
          id="motif-session"
          name="motif"
          maxLength={200}
          placeholder="Assistance au dépôt d'une attestation"
          className="max-w-md"
        />
      </div>
      <BoutonEnvoi enCoursTexte="Ouverture…">Entrer dans la session de {nom}</BoutonEnvoi>
      {etat.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
    </form>
  );
}
