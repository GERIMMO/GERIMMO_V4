"use client";

import Link from "next/link";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { inviterLocataire, annulerInvitation, type EtatInvitation } from "@/app/actions/invitations";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { etatInvitation, LIBELLES_INVITATION, type InvitationLocataire } from "@/lib/invitations-locataire";

export function FormulaireInvitation({ orgId, personId, email, dejaInvite, accesSuspendu = false, historique = [], erreurLecture = false }: {
  orgId: string; personId: string; email: string | null; dejaInvite: boolean; accesSuspendu?: boolean;
  historique?: InvitationLocataire[]; erreurLecture?: boolean;
}) {
  const [etat, action] = useActionState<EtatInvitation, FormData>(inviterLocataire.bind(null, orgId, personId), {});
  const derniere = historique[0];
  const statut = derniere ? etatInvitation(derniere) : null;
  const [annulation, annuler] = useActionState<EtatInvitation, FormData>(annulerInvitation.bind(null, orgId, personId, derniere?.id ?? ""), {});
  return <div className="space-y-3">
    {dejaInvite ? <p className="text-sm text-success-soft-foreground">Compte locataire actif : la personne accède à son espace.</p> : accesSuspendu ? <p className="text-sm text-muted-foreground">Accès locataire désactivé. Les documents conservés restent consultables ; une invitation ne réactive pas cet accès.</p> : !email ? <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Ajoutez un email à cette fiche pour pouvoir l’inviter comme locataire.</p>
      <Link href={`/agence/${orgId}/personnes/${personId}?modifier=1#identite`} className="lien-discret text-sm">Ajouter un email</Link>
    </div> : <>
      <p className="text-sm text-muted-foreground">{email} recevra une invitation valable 30 jours. La personne choisira de l’accepter ou de la refuser avant d’accéder à son espace.</p>
      {derniere && <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
        <strong>{LIBELLES_INVITATION[statut!] ?? statut}</strong>
        <p className="mt-1 text-muted-foreground">{statut === "en_attente" ? "Valable jusqu’au" : "Échéance :"} {new Date(derniere.expire_le).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</p>
        {statut === "en_attente" && (!derniere.envoye_le || derniere.erreur_envoi) && <p className="mt-1 text-destructive">L’envoi de l’e-mail reste à confirmer. Vous pouvez le renvoyer.</p>}
      </div>}
      <div className="flex flex-wrap gap-2">
        <form data-saisie-confirmee action={action}><BoutonEnvoi size="sm" variant="outline" enCoursTexte="Invitation…">{statut === "en_attente" ? "Renvoyer l’invitation" : derniere ? "Envoyer une nouvelle invitation" : "Inviter comme locataire"}</BoutonEnvoi></form>
        {statut === "en_attente" && <form data-saisie-confirmee action={annuler}><BoutonEnvoi size="sm" variant="ghost" enCoursTexte="Annulation…">Annuler l’invitation</BoutonEnvoi></form>}
      </div>
    </>}
    {erreurLecture && <p role="alert" className="text-sm text-destructive">L’historique des invitations n’a pas pu être chargé. Rechargez la fiche.</p>}
    {(etat.erreur || annulation.erreur) && <p role="alert" className="text-sm text-destructive">{etat.erreur || annulation.erreur}</p>}
    {(etat.succes || annulation.succes) && <p role="status" className="text-sm text-success-soft-foreground">{etat.succes || annulation.succes}</p>}
    {historique.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-muted-foreground">Historique des invitations</summary><ul className="mt-2 space-y-2">{historique.map(i => <li key={i.id}>{new Date(i.cree_le).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} · {LIBELLES_INVITATION[etatInvitation(i)] ?? i.etat}{i.email && <span className="block break-all text-xs text-muted-foreground">{i.email}</span>}</li>)}</ul></details>}
  </div>;
}
