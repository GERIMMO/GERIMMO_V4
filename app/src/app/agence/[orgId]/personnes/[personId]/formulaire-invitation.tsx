"use client";

import { useActionState } from "react";
import { inviterLocataire, type EtatInvitation } from "@/app/actions/invitations";
import { Button } from "@/components/ui/button";

export function FormulaireInvitation({
  orgId,
  personId,
  email,
  dejaInvite,
}: {
  orgId: string;
  personId: string;
  email: string | null;
  dejaInvite: boolean;
}) {
  const action = inviterLocataire.bind(null, orgId, personId);
  const [etat, formAction, enCours] = useActionState<EtatInvitation, FormData>(action, {});

  if (dejaInvite) {
    return (
      <p className="text-sm text-success-soft-foreground">
        Compte locataire actif — la personne peut accéder à son espace.
      </p>
    );
  }
  if (!email) {
    return (
      <p className="text-sm text-muted-foreground">
        Ajoutez un email à cette fiche pour pouvoir l&apos;inviter comme locataire.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Créer un accès locataire pour {email} — un email lui permettra de définir
        son mot de passe.
      </p>
      <Button type="submit" size="sm" variant="outline" disabled={enCours}>
        {enCours ? "Invitation…" : "Inviter comme locataire"}
      </Button>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
    </form>
  );
}
