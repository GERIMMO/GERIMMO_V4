"use client";
import { useActionState, useId } from "react";
import { validerFactureArtisan, type EtatIncidentAction } from "@/app/actions/incidents";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
export function ValidationFacture({orgId, factureId}: {orgId:string; factureId:string}) {
  const id = useId();
  const [etat, action] = useActionState<EtatIncidentAction, FormData>(validerFactureArtisan.bind(null, orgId, factureId), {});
  return <form action={action} className="space-y-2">
    <label htmlFor={id} className="block text-sm">Résultat du contrôle de la facture</label>
    <textarea id={id} name="motif" required maxLength={4000} className="w-full rounded-md border p-2" placeholder="Pièce et montant vérifiés ; expliquez votre décision en cas d’écart." />
    <p className="text-sm text-muted-foreground">La validation confirme la facture et sa prise en charge. Elle ne déclenche aucun paiement ni débit du locataire.</p>
    <BoutonEnvoi>Valider cette facture</BoutonEnvoi>
    {etat.erreur && <p role="alert">{etat.erreur}</p>}
    {etat.succes && <p role="status">{etat.succes}</p>}
  </form>;
}
