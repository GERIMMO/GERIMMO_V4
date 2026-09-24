"use client";

import Link from "next/link";
import { useActionState } from "react";
import { inviterLocataire, type EtatInvitation } from "@/app/actions/invitations";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

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
  const [etat, formAction] = useActionState<EtatInvitation, FormData>(action, {});

  if (dejaInvite) {
    return (
      // Seule ligne de la carte quand le compte existe (24/09) : elle dit
      // aussi à quoi sert l'espace, ce que disait la description retirée.
      <p className="text-sm text-success-soft-foreground">
        Compte locataire actif — la personne accède à son espace (dépôt
        d&apos;attestation, suivi).
      </p>
    );
  }
  if (!email) {
    // La consigne porte son geste (24/09) : « Modifier la fiche » est en haut
    // de page, hors écran au téléphone — le lien y mène, formulaire ouvert.
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Ajoutez un email à cette fiche pour pouvoir l&apos;inviter comme locataire.
        </p>
        <Link
          href={`/agence/${orgId}/personnes/${personId}?modifier=1#identite`}
          className="lien-discret text-sm"
        >
          Ajouter un email
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Créer un accès locataire pour {email} — un email lui permettra de définir
        son mot de passe.
      </p>
      <BoutonEnvoi size="sm" variant="outline" enCoursTexte="Invitation…">
        Inviter comme locataire
      </BoutonEnvoi>
      {etat.erreur && <p className="text-sm text-destructive">{etat.erreur}</p>}
      {etat.succes && <p className="text-sm text-success-soft-foreground">{etat.succes}</p>}
    </form>
  );
}
