"use client";
import { useContext,useState,useTransition,type ReactNode } from "react";
import { genererDocument,type EtatGeneration } from "@/app/actions/documents-generes";
import { envoyerPourSignature } from "@/app/actions/signature";
import type { CodeModele } from "@/lib/documents/modeles";
import { cibleChampBail } from "@/lib/documents/champs-bail-parcours";
import { EtapeComplementsBail } from "@/lib/etape-complements-bail";
import { CompletudeBail } from "@/lib/suivi-enregistrement";
import { PastilleBail } from "@/components/pastille-bail";
import { Button } from "@/components/ui/button";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { FileText,Send } from "lucide-react";
export function FinaliserParcoursBail({orgId,bailId,code,signataires,edlId,preparationEdl,signatureManuelle}:{orgId:string;bailId:string;code:CodeModele;signataires:{id:string;nom:string}[];edlId:string|null;preparationEdl:ReactNode;signatureManuelle:ReactNode}){
 const [pdf,setPdf]=useState<EtatGeneration|null>(null),[enCours,demarrer]=useTransition();
 const [retours,setRetours]=useState<Record<string,{erreur?:string;succes?:string}>>({});
 const controle=useContext(CompletudeBail);
 const revision=useContext(EtapeComplementsBail)?.revision??0;
 const [revisionPdf,setRevisionPdf]=useState(-1);
 const pdfCourant=revisionPdf===revision;
 const retour=`/agence/${orgId}/baux/${bailId}`;
 function generer(){demarrer(async()=>{setPdf(null);setRetours({});try{setPdf(await genererDocument(orgId,code,bailId,retour));setRevisionPdf(revision);}catch{setPdf({erreur:"La génération a été interrompue. Réessayez."});}});}
 const manquants=controle?.manquants??pdf?.manquants??[];
 return <section className="bail-finalisation" id="signature"><header><FileText size={22}/><div><h3>Vos documents à signer</h3><p>Générez les PDF après avoir vérifié le récapitulatif.</p></div></header>
  {manquants.length>0&&<section aria-labelledby="titre-oublis-bail" className="rounded-xl border border-border bg-warning-soft p-4 text-sm">
    <h4 id="titre-oublis-bail" className="flex items-center gap-2 font-semibold"><PastilleBail manquant/>À compléter pour le PDF · {manquants.length}</h4>
    <p className="mt-1 text-xs text-muted-foreground">Cliquez sur une information pour revenir au champ à compléter. La liste se met à jour après chaque enregistrement.</p>
    <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">{manquants.map(m=><li key={m}><a className="inline-flex min-h-11 w-full items-center justify-between gap-3 underline decoration-border underline-offset-4 hover:decoration-current" href={cibleChampBail(m,orgId).href}><span>{m}</span><span aria-hidden="true">→</span></a></li>)}</ul>
  </section>}
  {pdf?.documentId&&!pdfCourant&&<p role="status" className="text-sm">Le dossier a été modifié. Générez un nouveau PDF avant de demander les signatures.</p>}
  <div className="bail-finalisation-docs"><div><h4>1. Le contrat de location</h4><Button onClick={generer} disabled={enCours}>{enCours?"Génération…":"Générer le PDF du bail"}</Button>{pdf?.erreur&&<p role="alert" className="text-sm text-destructive">{pdf.erreur}</p>}{pdf?.documentId&&!pdf.erreur&&pdfCourant&&<a className="lien-discret block mt-2" href={`/agence/${orgId}/documents/${pdf.documentId}/fichier`} target="_blank" rel="noreferrer">Ouvrir et relire le PDF</a>}</div>
   <div id="edl"><h4>2. L’état des lieux d’entrée</h4>{edlId?<><BoutonGenererDocument orgId={orgId} code="edl" cibleId={edlId} cheminRetour={retour} libelle="Générer le PDF de l’état des lieux"/><a className="lien-discret block mt-2" href={`${retour}/edl/${edlId}`}>Compléter la grille de l’état des lieux</a></>:<><p className="text-sm mb-2">Préparez d’abord la grille : pièces, observations, compteurs et clés.</p>{preparationEdl}</>}<p className="text-xs text-muted-foreground mt-2">L’état des lieux se complète et se signe avec les parties à la remise des clés. Son circuit de signature se trouve dans la grille.</p></div>
  </div>
  <div className="bail-envoi-signature"><h4><Send size={16}/>3. Envoyer le bail pour signature</h4>{pdf?.documentId&&!pdf.erreur&&pdfCourant&&!controle?.erreur&&manquants.length===0?<><p className="text-sm">Après relecture, choisissez les locataires à qui demander une signature. Chaque envoi les prévient et utilise le circuit de signature existant.</p>{signataires.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{p.nom}</span><Button size="sm" variant="outline" disabled={enCours||Boolean(retours[p.id]?.succes)} onClick={()=>demarrer(async()=>{try{const res=await envoyerPourSignature(orgId,pdf.documentId!,p.id);setRetours(v=>({...v,[p.id]:res}));}catch{setRetours(v=>({...v,[p.id]:{erreur:"La confirmation de l’envoi n’a pas pu être reçue. Vérifiez le suivi dans Documents avant de réessayer."}}));}})}>{retours[p.id]?.succes?"Demande envoyée":"Envoyer pour signature"}</Button>{retours[p.id]?.erreur&&<p role="alert" className="w-full text-sm text-destructive">{retours[p.id].erreur}</p>}</div>)}<a className="lien-discret" href={`/agence/${orgId}/documents?sel=${pdf.documentId}`}>Suivre les signatures du document</a></>:<p className="text-sm text-muted-foreground">Générez le PDF du bail complet pour ouvrir les envois en signature.</p>}</div>
  {signatureManuelle}
 </section>;
}
