"use client";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { deposerAnnexeBail } from "@/app/actions/annexe-bail";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChampFichier } from "@/components/champ-fichier";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
export function FormulaireAnnexeBail({orgId,bailId}:{orgId:string;bailId:string}){
 const {etat,soumettre,enCours,version}=useActionFormulaire(deposerAnnexeBail.bind(null,orgId,bailId),true);
 return <form key={version} onSubmit={soumettre} className="space-y-3">
  <div><Label htmlFor="annexe-titre">Nom du justificatif</Label><Input id="annexe-titre" name="titre" required maxLength={200} placeholder="Attestation d’assurance, autorisation de louer…"/></div>
  <div><Label htmlFor="annexe-fichier">Fichier (PDF, JPEG ou PNG)</Label><ChampFichier id="annexe-fichier" name="fichier" required accept=".pdf,.jpg,.jpeg,.png"/></div>
  {etat.erreur&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
  {etat.succes&&<p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
  <BoutonEnvoi enCours={enCours} variant="outline">Ajouter le justificatif</BoutonEnvoi>
 </form>;
}
