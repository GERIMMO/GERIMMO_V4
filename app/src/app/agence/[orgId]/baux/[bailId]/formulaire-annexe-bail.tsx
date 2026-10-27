"use client";
import { useId, useState } from "react";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import { deposerAnnexeBail } from "@/app/actions/annexe-bail";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChampFichier } from "@/components/champ-fichier";
import { BoutonEnvoi } from "@/components/ui/bouton-envoi";
export function FormulaireAnnexeBail({orgId,bailId,titreInitial}:{orgId:string;bailId:string;titreInitial?:string}){
 const id=useId();
 const [ouvert,setOuvert]=useState(false);
 const {etat,soumettre,enCours,version}=useActionFormulaire(async (etat,form)=>{
  const resultat=await deposerAnnexeBail(orgId,bailId,etat,form);
  if(resultat.succes)setOuvert(false);
  return resultat;
 },true);
 return <div className="mt-3 space-y-3">
  <button type="button" className="lien-discret" aria-expanded={ouvert} aria-controls={`${id}-depot`} disabled={enCours} onClick={()=>setOuvert(!ouvert)}>{ouvert?"Fermer le dépôt":titreInitial?"Joindre ce document":"Ajouter un autre justificatif"}</button>
  {etat.succes&&!ouvert&&<p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
  <div id={`${id}-depot`} hidden={!ouvert}><form data-saisie-confirmee key={version} onSubmit={soumettre}><fieldset className="space-y-3" disabled={!ouvert||enCours}>
  {titreInitial?<input type="hidden" name="titre" value={titreInitial}/>:<div><Label htmlFor={`${id}-titre`}>Nom du justificatif</Label><Input id={`${id}-titre`} name="titre" required maxLength={200} placeholder="Nom du document" disabled={!ouvert||enCours}/></div>}
  <div><Label htmlFor={`${id}-fichier`}>Fichier (PDF, JPEG ou PNG)</Label><ChampFichier depotDirect id={`${id}-fichier`} name="fichier" required accept=".pdf,.jpg,.jpeg,.png"/></div>
  {etat.erreur&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
  {etat.succes&&<p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
  <BoutonEnvoi enCours={enCours} variant="outline">Ajouter le justificatif</BoutonEnvoi>
 </fieldset></form></div></div>;
}
