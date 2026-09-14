"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { genererDepuisCatalogue } from "@/app/actions/catalogue-documents";
import type { EtatGeneration } from "@/app/actions/documents-generes";
import { OPTIONS_CATALOGUE } from "@/lib/documents/catalogue-options";
import type { ChoixDossier } from "@/lib/documents/catalogue-cibles";
export function FormulaireCatalogue({orgId,modeleId,choix,garants=[]}:{orgId:string;modeleId:string;choix:ChoixDossier[];garants?:{id:string;libelle:string;bailId:string}[]}) {
  const [cible,setCible]=useState(choix.length===1?choix[0].id:"");
  const [etat,action,enCours]=useActionState(async (_:EtatGeneration,data:FormData)=>{
    const options=Object.fromEntries((OPTIONS_CATALOGUE[modeleId]??[]).map(c=>[c.cle,String(data.get(c.cle)??"").trim()]));
    return genererDepuisCatalogue(orgId,modeleId,String(data.get("cible")??""),options);
  },{});
  const champs=OPTIONS_CATALOGUE[modeleId]??[];
  const style="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
  return <form action={action} className="space-y-5">
    <label className="block space-y-2 text-sm font-medium"><span>Dossier concerné</span><select name="cible" required className={style} value={cible} onChange={e=>setCible(e.target.value)}><option value="" disabled>Choisir un dossier</option>{choix.map(c=><option key={c.id} value={c.id}>{c.libelle}</option>)}</select></label>
    <div className="grid gap-4 sm:grid-cols-2">{champs.map(c=><label key={c.cle} className={`block space-y-2 text-sm font-medium ${c.type==="textarea"?"sm:col-span-2":""}`}><span>{c.libelle}</span>
      {c.cle==="garant"?<select key={cible} name={c.cle} className={style} required defaultValue=""><option value="" disabled>Choisir un garant rattaché au dossier</option>{garants.filter(g=>g.bailId===cible).map(g=><option key={g.id} value={g.id}>{g.libelle}</option>)}</select>:
      c.choix?<select name={c.cle} className={style}>{c.choix.map(v=><option value={v.valeur} key={v.valeur}>{v.libelle}</option>)}</select>:
      c.type==="textarea"?<textarea name={c.cle} rows={3} maxLength={6000} className={style}/>:
      <input name={c.cle} type={c.type??"text"} step={c.type==="number"?"any":undefined} maxLength={500} className={style} defaultValue={c.cle==="annee"?new Date().getFullYear():undefined}/>}
      {c.aide&&<span className="block text-xs font-normal text-muted-foreground">{c.aide}</span>}</label>)}</div>
    <p className="text-sm text-muted-foreground">Les informations du dossier sont reprises automatiquement. Vérifiez les champs signalés avant de signer ou partager le document. La génération ne déclenche aucun envoi.</p>
    <Button disabled={enCours||!choix.length} type="submit">{enCours?"Préparation du PDF…":"Générer et ranger dans Documents"}</Button>
    {etat.erreur&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
    {etat.succes&&<p role="status" className="text-sm text-success">{etat.succes}</p>}
    {etat.documentId&&<Link className="block font-medium text-primary underline" href={`/agence/${orgId}/documents/${etat.documentId}/fichier`} target="_blank" rel="noopener">Ouvrir le PDF</Link>}
    {!!etat.manquants?.length&&<details open className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">{etat.manquants.length} informations à compléter avant utilisation</summary><ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{etat.manquants.map(m=><li key={m}>{m}</li>)}</ul></details>}
  </form>;
}
