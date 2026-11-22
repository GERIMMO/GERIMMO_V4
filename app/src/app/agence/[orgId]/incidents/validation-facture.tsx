"use client";
import { useId } from "react";
import { useActionStateProtegee as useActionState } from "@/lib/use-action-state-protegee";
import { refuserFactureArtisan, validerFactureArtisan, type EtatIncidentAction } from "@/app/actions/incidents";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
import { MOTIF_REFUS_FACTURE } from "@/lib/reglement-facture";
export function ValidationFacture({orgId, factureId}: {orgId:string; factureId:string}) {
  const id = useId();
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(validerFactureArtisan.bind(null, orgId, factureId), {});
  return <form data-saisie-confirmee action={action} className="space-y-2">
    <label htmlFor={id} className="block text-sm">Résultat du contrôle de la facture</label>
    <textarea id={id} name="motif" required maxLength={4000} className="w-full rounded-md border p-2" placeholder="Pièce et montant vérifiés ; expliquez votre décision en cas d’écart." />
    <p className="text-sm text-muted-foreground">La validation confirme la facture et sa prise en charge. Elle ne déclenche aucun paiement ni débit du locataire.</p>
    <BoutonEnvoi>Valider cette facture</BoutonEnvoi>
    {etat.erreur && <p role="alert">{etat.erreur}</p>}
    {etat.succes && <p role="status">{etat.succes}</p>}
  </form>;
}

/**
 * Audit palier 1 (P1-03) : une facture fausse se refuse, avec ce que l'artisan doit corriger (référentiel, module 9,
 * variante V5). Replié sous la validation : le geste courant reste « valider ». La facture refusée reste au dossier.
 */
export function RefusFacture({orgId, factureId}: {orgId:string; factureId:string}) {
  const id = useId();
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(refuserFactureArtisan.bind(null, orgId, factureId), {});
  return <details className="text-sm" data-refus-facture>
    <summary className="inline-flex min-h-11 cursor-pointer items-center text-[var(--destructive-soft-foreground)] underline underline-offset-2">Refuser cette facture</summary>
    <form data-saisie-confirmee action={action} className="mt-2 space-y-2">
      <label htmlFor={id} className="block text-sm">Ce que l’artisan doit corriger</label>
      <textarea id={id} name="motif_refus" required minLength={MOTIF_REFUS_FACTURE.min} maxLength={MOTIF_REFUS_FACTURE.max} className="w-full rounded-md border p-2" placeholder="Montant, client, date, prestation facturée…" />
      <p className="text-sm text-muted-foreground">L’artisan lit ce motif dans son espace et peut déposer une autre facture. La facture refusée reste au dossier, sans être modifiée. Une facture déjà validée ne se refuse plus.</p>
      <BoutonEnvoi variant="destructive">Refuser et demander une correction</BoutonEnvoi>
      {etat.erreur && <p role="alert">{etat.erreur}</p>}
      {etat.succes && <p role="status">{etat.succes}</p>}
    </form>
  </details>;
}
