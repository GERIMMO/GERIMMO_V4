"use client";
import {useActionState} from "react";
import {useFormStatus} from "react-dom";
import {envoyerDevisValide} from "../actions-preparation";
import {CLASSE_BOUTON_SOBRE,Erreur} from "../../ui";
function Bouton(){const{pending}=useFormStatus();return <button className={CLASSE_BOUTON_SOBRE} disabled={pending}>{pending?"Envoi…":"Réessayer l’envoi de l’e-mail"}</button>;}
export function RenvoyerEmail({id,revision}:{id:string;revision:number}) {
  const[etat,action]=useActionState(envoyerDevisValide.bind(null,id),{});
  return <form action={action} className="mt-3 space-y-3"><input type="hidden" name="revision" value={revision}/>{etat.erreur&&<Erreur>{etat.erreur}</Erreur>}<Bouton/></form>;
}
