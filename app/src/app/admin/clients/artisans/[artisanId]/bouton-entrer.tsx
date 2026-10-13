"use client";

import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import {
  entrerDansSessionArtisan,
  type EtatSessionArtisan,
} from "@/app/actions/session-artisan";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Le diagnostic consulte l’espace sans autoriser d’écriture. */
export function BoutonEntrerSession({ artisanId, nom }: { artisanId: string; nom: string }) {
  const [etat, action] = useActionState<EtatSessionArtisan, FormData>(
    entrerDansSessionArtisan.bind(null, artisanId),
    {}
  );

  return (
    <form data-saisie-confirmee action={action} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="motif-session">Motif du diagnostic (obligatoire, inscrit au journal)</Label>
        <Input
          id="motif-session"
          name="motif"
          required
          minLength={3}
          maxLength={1000}
          placeholder="Vérifier la difficulté signalée sur une attestation"
          className="max-w-md"
        />
      </div>
      <p className="text-sm text-muted-foreground">Lecture seule pendant trente minutes. Aucun devis, message ou document ne peut être modifié.</p>
      <BoutonEnvoi enCoursTexte="Ouverture…">Diagnostiquer l’espace de {nom}</BoutonEnvoi>
      {etat.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
    </form>
  );
}
