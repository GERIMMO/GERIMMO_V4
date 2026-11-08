"use client";
import { useId, useState, useTransition } from "react";
import { enregistrerConsommation } from "@/app/actions/consommations";
import { Button } from "./ui/button";
export function SaisieIndexFacture({org,bien,compteur,jour,unite,max}:{
  org:string; bien:string; compteur:string; jour:string; unite:string; max:string;
}) {
  const id=useId();
  const [valeur, saisir]=useState("");
  const [message, afficher]=useState("");
  const [enregistre, confirmer]=useState(false);
  const [pending,lancer]=useTransition();
  return <div className="flex flex-wrap items-center gap-2">
    <label htmlFor={id}>Index ({unite==="m3"?"m³":unite})</label>
    <input id={id} inputMode="decimal" value={valeur} disabled={pending||enregistre||jour>max} onChange={e=>saisir(e.target.value)} className="max-w-32"/>
    <Button type="button" size="sm" variant="outline" disabled={pending||enregistre||!valeur.trim()||jour>max} onClick={()=>lancer(async()=>{
      try {
        const f=new FormData();f.set("action","releve");f.set("id",compteur);f.set("index",valeur);f.set("date",jour);
        const r=await enregistrerConsommation(org,bien,null,{},f);
        afficher(r.erreur ?? r.succes ?? "Réessayez.");confirmer(!!r.succes);
      } catch { afficher("Enregistrement interrompu. Réessayez."); }
    })}>{pending?"Enregistrement…":enregistre?"Enregistré":"Enregistrer l’index"}</Button>
    {message && <span role="status">{message}</span>}
  </div>;
}
