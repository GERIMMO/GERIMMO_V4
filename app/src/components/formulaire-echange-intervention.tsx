"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useActionStateProtegee } from "@/lib/use-action-state-protegee";
import { agirEchangeIntervention,type EtatEchangeIntervention } from "@/app/actions/echanges-intervention";
import { BoutonEnvoi } from "./ui/bouton-envoi";
export function FormulaireEchangeIntervention({intervention,fermee,gestionnaire}:{intervention:string;fermee:boolean;gestionnaire:boolean}){
 const commande=useRef<string|null>(null);
 const [texte,setTexte]=useState("");
 const router=useRouter();
 const [actualisation,actualiser]=useTransition();
 const [etat,action,pending]=useActionStateProtegee(async(e:EtatEchangeIntervention,f:FormData)=>{
  if(f.get("action")==="envoyer"){commande.current??=crypto.randomUUID();f.set("commande",commande.current);}
  const r=await agirEchangeIntervention(intervention,e,f);if(r.succes){commande.current=null;if(f.get("action")==="envoyer")setTexte("");}return r;
 },{} as EtatEchangeIntervention);
 return <div className="space-y-3">
  {!fermee&&<form action={action} data-saisie-confirmee className="space-y-2"><input name="action" type="hidden" value="envoyer"/><label className="block text-sm font-medium">Votre message<textarea name="texte" value={texte} onChange={e=>setTexte(e.target.value)} required maxLength={4000} rows={3} disabled={pending} className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-base" placeholder="Disponibilités, accès au logement, suivi de l’intervention…"/></label><BoutonEnvoi enCours={pending} enCoursTexte="Envoi…">Envoyer dans la discussion</BoutonEnvoi></form>}
  {gestionnaire&&<form action={action} data-saisie-confirmee><input name="action" type="hidden" value={fermee?"rouvrir":"fermer"}/><BoutonEnvoi variant="outline" enCours={pending}>{fermee?"Rouvrir la discussion":"Fermer la discussion"}</BoutonEnvoi></form>}
  <button type="button" disabled={actualisation||pending} onClick={()=>actualiser(()=>router.refresh())} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">{actualisation?"Actualisation…":"Actualiser les échanges"}</button>
  {etat.erreur&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}{etat.succes&&<p role="status" className="text-sm text-success-soft-foreground">{etat.succes}</p>}
 </div>;
}
