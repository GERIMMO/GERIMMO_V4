"use client";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { corrigerClasseDpeLot } from "@/app/actions/classe-dpe-lot";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
export function FormulaireClasseDpeLot({orgId,lotId,diagnosticId,classe}: {orgId:string;lotId:string;diagnosticId:string;classe:string|null}) {
  const {etat,soumettre,enCours} = useActionFormulaire(corrigerClasseDpeLot.bind(null,orgId,lotId,diagnosticId));
  return <form onSubmit={soumettre} className="mt-3 space-y-2 rounded-lg bg-muted/40 p-3">
    <label htmlFor={`classe-${diagnosticId}`} className="text-sm font-medium">Classe du DPE déjà déposé *</label>
    <p className="text-xs text-muted-foreground">Recopiez la classe du rapport existant. Le fichier est conservé et la classe est reprise dans vos baux.</p>
    <div className="flex flex-wrap gap-2"><select id={`classe-${diagnosticId}`} name="classe_dpe" defaultValue={classe??""} required className="h-10 rounded-md border border-input bg-background px-3"><option value="">À renseigner</option>{["A","B","C","D","E","F","G"].map(c=><option key={c}>{c}</option>)}</select><BoutonEnvoi enCours={enCours} variant="outline">Enregistrer la classe</BoutonEnvoi></div>
    {etat.erreur&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}{etat.succes&&<p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
  </form>;
}
