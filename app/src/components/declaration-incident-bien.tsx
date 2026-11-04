"use client";
import { useState } from "react";
import { declarerIncidentBien,type EtatIncidentBien } from "@/app/actions/incident-bien-simple";
import { useActionStateProtegee } from "@/lib/use-action-state-protegee";
import { BoutonEnvoi } from "./ui/bouton-envoi";
export function DeclarationIncidentBien({org,bien,lots,jour}:{org:string;bien:string;lots:{id:string;nom:string}[];jour:string}){
 const [ouvert,setOuvert]=useState(false);
 const [cle,setCle]=useState("");
 function ouvrir(){setCle(crypto.randomUUID());setOuvert(true)}
 return <div>{!ouvert?<button className="btn-or" type="button" onClick={ouvrir}>Déclarer un incident</button>:<Saisie key={cle} org={org} bien={bien} lots={lots} jour={jour} commande={cle} fermer={()=>setOuvert(false)}/>}</div>;
}
function Saisie({org,bien,lots,jour,commande,fermer}:{org:string;bien:string;lots:{id:string;nom:string}[];jour:string;commande:string;fermer:()=>void}){
 const [etat,action,pending]=useActionStateProtegee<EtatIncidentBien,FormData>(async(etat,f)=>{const resultat=await declarerIncidentBien(org,bien,etat,f);if(resultat.succes)fermer();return resultat},{});
 return <form action={action} data-saisie-confirmee className="mt-3 space-y-3 rounded-xl border border-border bg-muted/30 p-4">
  <input type="hidden" name="commande" value={commande}/>
  {lots.length===0?<input type="hidden" name="lot" value=""/>:lots.length===1?<input type="hidden" name="lot" value={lots[0].id}/>:<label className="block text-sm">Concerne<select name="lot" className="mt-1 block min-h-11 w-full rounded-lg border bg-background px-3" defaultValue=""><option value="">Tout le bien / parties communes</option>{lots.map(l=><option key={l.id} value={l.id}>{l.nom}</option>)}</select></label>}
  <label className="block text-sm">Titre<input name="titre" required maxLength={150} className="mt-1 block min-h-11 w-full rounded-lg border bg-background px-3" placeholder="Ex. Fuite sous l’évier"/></label>
  <label className="block text-sm">Date<input name="date" type="date" required defaultValue={jour} max={jour} className="mt-1 block min-h-11 rounded-lg border bg-background px-3"/></label>
  <label className="block text-sm">Note <span className="text-muted-foreground">(facultative)</span><textarea name="note" maxLength={5000} rows={3} className="mt-1 block w-full rounded-lg border bg-background p-3"/></label>
  {etat.erreur&&<p role="alert" className="err">{etat.erreur}</p>}
  <div className="flex flex-wrap gap-2"><BoutonEnvoi enCours={pending} enCoursTexte="Enregistrement…">Déclarer</BoutonEnvoi><button type="button" disabled={pending} className="lien-discret px-3" onClick={fermer}>Annuler</button></div>
 </form>;
}
