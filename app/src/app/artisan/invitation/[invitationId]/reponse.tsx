"use client";

import { useActionState } from "react";
import { repondreInvitationArtisan, type EtatInvitationArtisan } from "@/app/actions/invitations-artisan";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { Erreur, Succes } from "../../ui";

/**
 * Accepter ou refuser l'invitation d'un propriétaire (décision du 15/10/2026). Rien n'est rattaché sans ce geste.
 * `accepter` faux : l'artisan n'a pas encore inscrit son entreprise, il ne peut que refuser (accepter viendra après).
 */
export function ReponseInvitationArtisan({ invitationId, accepter }: { invitationId: string; accepter: boolean }) {
  const [etat, action] = useActionState<EtatInvitationArtisan, FormData>(repondreInvitationArtisan.bind(null, invitationId), {});
  return (
    <form data-saisie-libre action={action} className="space-y-3">
      <div className="flex flex-wrap gap-3">
        {accepter && (
          <BoutonEnvoi name="decision" value="accepter" enCoursTexte="Enregistrement…">
            Accepter l’invitation
          </BoutonEnvoi>
        )}
        <BoutonEnvoi name="decision" value="refuser" variant="outline" enCoursTexte="Enregistrement…">
          Refuser l’invitation
        </BoutonEnvoi>
      </div>
      {etat.erreur && <Erreur>{etat.erreur}</Erreur>}
      {etat.succes && <Succes>{etat.succes}</Succes>}
    </form>
  );
}
