"use client";
import Link from "next/link";
import { useActionState } from "react";
import { repondreInvitation, type EtatInvitation } from "@/app/actions/invitations";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { CASE_REGLES_INVITES } from "@/lib/conditions-acceptation";
export function ReponseInvitation({ id }: { id: string }) {
  const [etat, action] = useActionState<EtatInvitation, FormData>(repondreInvitation.bind(null,id),{});
  return <form data-saisie-libre action={action} className="space-y-4">
    <p className="text-sm text-muted-foreground">Accepter ouvre votre espace locataire et relie votre compte à votre fiche. Refuser n’ajoute aucun accès.</p>
    {/* Plan de conformité du 23/10 (R60) : la personne invitée ne contracte pas avec l'Éditeur ; elle respecte les règles de son espace, décrites à l'article 7 de la version en vigueur. */}
    <p className="text-sm text-muted-foreground">En acceptant, vous vous engagez à respecter les <Link className="lien-texte" href={CASE_REGLES_INVITES.href} target="_blank" rel="noopener">{CASE_REGLES_INVITES.lien}</Link> (article 7 des conditions générales).</p>
    <div className="flex flex-wrap gap-3"><BoutonEnvoi envoiNatif name="decision" value="accepter" enCoursTexte="Enregistrement…">Accepter l’invitation</BoutonEnvoi><BoutonEnvoi envoiNatif name="decision" value="refuser" variant="outline" enCoursTexte="Enregistrement…">Refuser</BoutonEnvoi></div>
    {etat.erreur && <p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
    {etat.succes && <p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
  </form>;
}
