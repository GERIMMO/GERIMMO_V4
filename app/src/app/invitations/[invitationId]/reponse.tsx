"use client";
import { useActionState } from "react";
import { repondreInvitation, type EtatInvitation } from "@/app/actions/invitations";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
export function ReponseInvitation({ id }: { id: string }) {
  const [etat, action] = useActionState<EtatInvitation, FormData>(repondreInvitation.bind(null,id),{});
  return <form action={action} className="space-y-4">
    <p className="text-sm text-muted-foreground">Accepter ouvre votre espace locataire et relie votre compte à votre fiche. Refuser n’ajoute aucun accès.</p>
    <div className="flex flex-wrap gap-3"><BoutonEnvoi name="decision" value="accepter" enCoursTexte="Enregistrement…">Accepter l’invitation</BoutonEnvoi><BoutonEnvoi name="decision" value="refuser" variant="outline" enCoursTexte="Enregistrement…">Refuser</BoutonEnvoi></div>
    {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
    {etat.succes && <p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
  </form>;
}
