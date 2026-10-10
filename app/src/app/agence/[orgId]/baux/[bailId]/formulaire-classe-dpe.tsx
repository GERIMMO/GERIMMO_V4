"use client";
import {useActionFormulaire} from "@/lib/use-action-formulaire";
import {corrigerClasseDpeBail} from "@/app/actions/annexe-bail";
import {LabelBail as Label} from "@/components/pastille-bail";
import {BoutonEnvoi} from "@/components/ui/bouton-envoi";
export function FormulaireClasseDpe({orgId,bailId,diagnosticId,classe}:{orgId:string;bailId:string;diagnosticId:string;classe:string|null}){
 const {etat,soumettre,enCours}=useActionFormulaire(corrigerClasseDpeBail.bind(null,orgId,bailId,diagnosticId));
 return <form onSubmit={soumettre} className="space-y-2 rounded-lg bg-muted/40 p-3"><Label htmlFor={`classe-${diagnosticId}`} champ="diagnostic.classe_dpe" renseigne={Boolean(classe)}>Classe du DPE déjà déposé *</Label><p className="text-xs text-muted-foreground">Recopiez la classe du rapport existant, sans le déposer une seconde fois.</p><div className="flex flex-wrap gap-2"><select id={`classe-${diagnosticId}`} name="classe_dpe" defaultValue={classe??""} required className="h-10 rounded-md border border-input bg-background px-3"><option value="">À renseigner</option>{["A","B","C","D","E","F","G"].map(c=><option key={c}>{c}</option>)}</select><BoutonEnvoi enCours={enCours} variant="outline">Enregistrer la classe</BoutonEnvoi></div>{etat.erreur&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}{etat.succes&&<p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}</form>;
}
