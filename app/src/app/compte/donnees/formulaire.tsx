"use client";
import { useState } from "react";
import { demanderGestionDonnees } from "@/app/actions/demandes-donnees";
import { useActionRetour } from "@/lib/use-action-retour";
import { TYPES_DEMANDE_DONNEES } from "@/lib/demandes-donnees";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
export function FormulaireDonnees({ cle }: { cle: string }) {
  const [cleEnvoi] = useState(cle);
  const { etat, soumettre, enCours } = useActionRetour(demanderGestionDonnees);
  if (etat.succes) return <p role="status" className="rounded-xl bg-success-soft p-4">{etat.succes}</p>;
  return <form data-saisie-confirmee onSubmit={soumettre} className="space-y-4" aria-busy={enCours}>
    <input type="hidden" name="cle_envoi" value={cleEnvoi}/>
    <label className="block space-y-2"><span className="font-medium">Votre demande</span><select name="type" required className="w-full rounded-lg border border-input bg-background p-3"><option value="">Choisir une demande</option>{Object.entries(TYPES_DEMANDE_DONNEES).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    <label className="block space-y-2"><span className="font-medium">Précisions</span><textarea name="description" rows={4} minLength={15} maxLength={6000} required className="w-full rounded-lg border border-input bg-background p-3" placeholder="Indiquez les données concernées ou ce que vous souhaitez obtenir." aria-describedby="donnees-aide"/></label>
    <p id="donnees-aide" className="text-sm text-muted-foreground">N’ajoutez ni pièce d’identité, ni mot de passe, ni coordonnées bancaires. Votre compte connecté permet de retrouver votre demande.</p>
    <p className="text-sm">Cette démarche est privée entre vous et Gerimmo. Elle ouvre un examen : elle ne supprime pas votre compte, ne résilie pas un bail et ne met pas fin automatiquement à un abonnement.</p>
    {etat.erreur&&<p role="alert" className="err">{etat.erreur}</p>}
    <BoutonEnvoi enCours={enCours} enCoursTexte="Enregistrement…">Enregistrer ma demande</BoutonEnvoi>
  </form>;
}
