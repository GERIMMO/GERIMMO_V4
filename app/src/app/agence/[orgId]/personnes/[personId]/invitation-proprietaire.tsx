"use client";

import { useActionState } from "react";
import { preparerInvitationProprietaire, revoquerInvitationProprietaire, type EtatInvitationProprietaire } from "@/app/actions/proprietaires-invites";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";

export function InvitationProprietaire({ orgId, personId, email, etatActuel }: { orgId: string; personId: string; email: string | null; etatActuel: string }) {
  const [etat, preparer] = useActionState<EtatInvitationProprietaire, FormData>(preparerInvitationProprietaire.bind(null, orgId, personId), {});
  const [retrait, retirer] = useActionState<EtatInvitationProprietaire, FormData>(revoquerInvitationProprietaire.bind(null, orgId, personId), {});
  return <section className="loc-carte space-y-3" aria-labelledby="acces-proprietaire">
    <h2 id="acces-proprietaire">Accès propriétaire invité</h2>
    <p className="text-sm text-muted-foreground">Consultation des lots confiés et des comptes rendus mensuels validés, sans accès aux dossiers des locataires ni aux autres bailleurs. Cet accès est inclus dans l’abonnement agence. Aucun e-mail n’est envoyé automatiquement.</p>
    <p className="text-sm">État : <strong>{({ acceptee: "accès ouvert", a_transmettre: "lien à transmettre", revoquee: "accès fermé", expiree: "lien expiré", aucun: "aucun accès" } as Record<string,string>)[etatActuel] ?? "lecture indisponible"}</strong></p>
    {email ? <form action={preparer} className="space-y-3">
      <label className="flex items-start gap-2 text-sm"><input name="confirmation" type="checkbox" required className="mt-1 size-5 shrink-0"/><span>Je confirme l’accès en consultation pour {email}. Tout ancien lien ou accès de cette fiche sera remplacé.</span></label>
      <BoutonEnvoi variant="outline" enCoursTexte="Préparation…">Préparer le lien propriétaire</BoutonEnvoi>
      {etat.erreur && <p role="alert" className="err">{etat.erreur}</p>}
      {etat.succes && <p role="status" className="text-sm">{etat.succes}</p>}
      {etat.lien && <label className="block text-sm">Lien à copier et transmettre<input readOnly value={etat.lien} onFocus={(e) => e.target.select()} className="mt-1 w-full rounded border p-2 text-sm"/></label>}
    </form> : <p className="text-sm">Complétez d’abord l’adresse e-mail de cette personne.</p>}
    {!['aucun','revoquee'].includes(etatActuel) && <form action={retirer} className="space-y-2 border-t border-border pt-3">
      <label className="flex items-start gap-2 text-sm"><input name="confirmation" type="checkbox" required className="mt-1 size-5 shrink-0"/><span>Fermer l’accès et invalider le lien de cette personne.</span></label>
      <BoutonEnvoi variant="outline" enCoursTexte="Fermeture…">Fermer l’accès propriétaire</BoutonEnvoi>
      {retrait.erreur && <p role="alert" className="err">{retrait.erreur}</p>}{retrait.succes && <p role="status" className="text-sm">{retrait.succes}</p>}
    </form>}
  </section>;
}
