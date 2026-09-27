"use client";

import { useActionState, useEffect, useRef } from "react";
import { inviterAgent, type EtatInvitationAgent } from "@/app/actions/organisation";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Ajouter un agent depuis l'Administration (audit agence 27/09) : l'admin
// d'agence invite lui-même, sans passer par l'équipe Gerimmo.
export function FormulaireInvitationAgent({ orgId }: { orgId: string }) {
  const [etat, action] = useActionState<EtatInvitationAgent, FormData>(
    inviterAgent.bind(null, orgId),
    {}
  );
  const formulaire = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (etat.succes) formulaire.current?.reset();
  }, [etat]);

  return (
    <form ref={formulaire} action={action} className="space-y-2">
      <Label htmlFor="invitation-agent-email">Ajouter un agent</Label>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          id="invitation-agent-email"
          name="email"
          type="email"
          autoComplete="off"
          placeholder="adresse e-mail de l’agent"
          defaultValue={etat.valeurs?.email}
          required
          className="min-h-11 min-w-0 flex-1 basis-60"
        />
        <BoutonEnvoi enCoursTexte="Invitation…" className="min-h-11">
          Inviter
        </BoutonEnvoi>
      </div>
      <p className="text-xs text-muted-foreground">
        L’agent reçoit un lien pour définir son mot de passe ; il commence avec
        un portefeuille vide — confiez-lui ensuite des mandats.
      </p>
      {etat.erreur && (
        <p role="alert" className="text-sm text-destructive">
          {etat.erreur}
        </p>
      )}
      {etat.succes && (
        <p role="status" className="text-sm text-success-soft-foreground">
          {etat.succes}
        </p>
      )}
    </form>
  );
}
