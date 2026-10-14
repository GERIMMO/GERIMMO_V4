"use client";
import { lienPourManquant } from "@/lib/documents/ou-renseigner";
import { useEffect, useState } from "react";
import { useActionFormulaire } from "@/lib/use-action-formulaire";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { genererDepuisCatalogue, proposerInteretsEmprunt } from "@/app/actions/catalogue-documents";
import type { EtatGeneration } from "@/app/actions/documents-generes";
import { OPTIONS_CATALOGUE } from "@/lib/documents/catalogue-options";
import type { ChoixDossier } from "@/lib/documents/catalogue-cibles";
export function FormulaireCatalogue({orgId,modeleId,choix,garants=[]}:{orgId:string;modeleId:string;choix:ChoixDossier[];garants?:{id:string;libelle:string;bailId:string}[]}) {
  const [cible,setCible]=useState(choix.length===1?choix[0].id:"");
  const [annee,setAnnee]=useState(String(new Date().getFullYear()));
  // D37 : « intérêts d'emprunt » du récapitulatif location nue, prérempli avec le montant que le livre porte en ligne 250 pour le lot et
  // l'année choisis (modifiable). Le serveur compare la valeur envoyée à ce même montant et signale l'écart sur le PDF.
  // `proposition` garde la dernière réponse avec sa clé (lot + année) : tant qu'elle ne correspond pas au choix courant, le bouton attend.
  const [interets,setInterets]=useState("0");
  const [proposition,setProposition]=useState<{cle:string;info:string}|null>(null);
  const cleProposition=modeleId==="recap_fiscal_nu"&&cible&&/^\d{4}$/.test(annee)?`${cible}|${annee}`:null;
  const calcul=cleProposition!==null&&proposition?.cle!==cleProposition;
  useEffect(()=>{
    if(!cleProposition) return;
    let annule=false;
    proposerInteretsEmprunt(orgId,cible,annee)
      .catch(()=>({erreur:"le service ne répond pas."}) as {erreur:string})
      .then(reponse=>{
        if(annule) return;
        if("erreur" in reponse){setProposition({cle:cleProposition,info:`Le montant du livre n’a pas pu être lu (${reponse.erreur}) Saisissez-le à la main : le PDF signalera l’écart éventuel.`});return;}
        setInterets(reponse.montant);
        setProposition({cle:cleProposition,info:reponse.qualifie?`Montant qualifié dans le livre pour ${annee} : ${reponse.montant} €.`:`Aucune dépense n’est qualifiée en ligne 250 dans le livre pour ${annee} : indiquez le montant des intérêts, ou 0.`});
      });
    return ()=>{annule=true;};
  },[orgId,cible,annee,cleProposition]);
  const infoInterets=calcul?"Lecture du montant du livre…":proposition?.info??"";
  const choixCourant=choix.find(c=>c.id===cible);
  const {etat,soumettre,enCours}=useActionFormulaire<EtatGeneration>(async (_:EtatGeneration,data:FormData)=>{
    const options=Object.fromEntries((OPTIONS_CATALOGUE[modeleId]??[]).map(c=>[c.cle,String(data.get(c.cle)??"").trim()]));
    return genererDepuisCatalogue(orgId,modeleId,String(data.get("cible")??""),options);
  });
  const champs=OPTIONS_CATALOGUE[modeleId]??[];
  const style="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm";
  return <form data-saisie-confirmee onSubmit={soumettre} aria-busy={enCours} className="space-y-5">
    <label className="block space-y-2 text-sm font-medium"><span>Dossier concerné</span><select name="cible" required className={style} value={cible} onChange={e=>setCible(e.target.value)}><option value="">Choisir un dossier</option>{choix.map(c=><option key={c.id} value={c.id}>{c.libelle}</option>)}</select></label>
    <div className="grid gap-4 sm:grid-cols-2">{champs.map(c=><label key={c.cle} className={`block space-y-2 text-sm font-medium ${c.type==="textarea"?"sm:col-span-2":""}`}><span>{c.libelle}</span>
      {c.cle==="garant"?<select key={cible} name={c.cle} className={style} required defaultValue=""><option value="" disabled>Choisir un garant rattaché au dossier</option>{garants.filter(g=>g.bailId===cible).map(g=><option key={g.id} value={g.id}>{g.libelle}</option>)}</select>:
      c.choix?<select name={c.cle} className={style} required>{c.choix.map(v=><option value={v.valeur} key={v.valeur}>{v.libelle}</option>)}</select>:
      c.type==="textarea"?<textarea name={c.cle} rows={3} maxLength={6000} className={style} required={!(c.repli==="detail_enregistre"&&choixCourant?.detailEnregistre)}/>:
      c.type==="montant"?<input name={c.cle} type="text" inputMode="decimal" maxLength={20} className={style} required value={interets} onChange={e=>setInterets(e.target.value)}/>:
      c.cle==="annee"?<input name={c.cle} type="number" step="any" maxLength={500} className={style} required value={annee} onChange={e=>setAnnee(e.target.value)}/>:
      <input name={c.cle} type={c.type??"text"} step={c.type==="number"?"any":undefined} maxLength={500} className={style} required/>}
      {c.aide&&<span className="block text-xs font-normal text-muted-foreground">{c.aide}</span>}
      {c.repli==="detail_enregistre"&&choixCourant?.detailEnregistre&&<span className="block text-xs font-normal text-muted-foreground">Cette régularisation porte déjà un détail : laissez vide pour le reprendre tel quel.</span>}
      {c.type==="montant"&&infoInterets&&<span role="status" className="block text-xs font-medium">{infoInterets}</span>}</label>)}</div>
    <p className="text-sm text-muted-foreground">Le PDF sera enregistré dans Documents. Aucun envoi automatique.</p>
    <Button disabled={enCours||!cible||!choix.length||calcul} type="submit">{enCours?"Préparation du PDF…":"Générer le PDF"}</Button>
    {etat.erreur&&!etat.manquants?.length&&<p role="alert" className="text-sm text-destructive">{etat.erreur}</p>}
    {etat.succes&&<p role="status" className="text-sm text-success">{etat.succes}</p>}
    {etat.documentId&&<Link className="block font-medium text-primary underline" href={`/agence/${orgId}/documents/${etat.documentId}/fichier`} target="_blank" rel="noopener">Ouvrir le PDF</Link>}
    {!!etat.manquants?.length&&<section aria-label="Informations à compléter" role="status" className="rounded-xl border border-[var(--or-filet)] bg-[var(--or-clair)] p-4">
      <h3 className="text-sm font-semibold">Encore {etat.manquants.length} {etat.manquants.length===1?"information":"informations"} à compléter</h3>
      <p className="mt-1 text-sm text-muted-foreground">Complétez le dossier, puis revenez générer le PDF.</p>
      <ul className="mt-3 divide-y divide-blue-100">{etat.manquants.map(m=>{
        const destination=lienPourManquant(m,orgId,etat.liens??[],modeleId);
        return <li key={m} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span className="min-w-0 flex-1">{m}</span>{destination&&<Link className="font-medium text-primary underline underline-offset-4" href={destination.href} aria-label={`Compléter : ${m} (${destination.ecran})`}>Compléter →</Link>}</li>;
      })}</ul>
    </section>}
  </form>;
}
