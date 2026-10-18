"use client";
import { useContext,useState,useTransition,type ReactNode } from "react";
import { genererDocument,type EtatGeneration } from "@/app/actions/documents-generes";
import type { CodeModele } from "@/lib/documents/modeles";
import { cibleChampBail } from "@/lib/documents/champs-bail-parcours";
import { EtapeComplementsBail } from "@/lib/etape-complements-bail";
import { CompletudeBail } from "@/lib/suivi-enregistrement";
import { PastilleBail } from "@/components/pastille-bail";
import { Button } from "@/components/ui/button";
import { BoutonGenererDocument } from "@/components/bouton-generer-document";
import { SignatureElectroniqueBail } from "@/components/signature-electronique-bail";
import { FileText } from "lucide-react";
import { useBaseEspace, useRacineEspace } from "@/components/racine-espace-contexte";
export function FinaliserParcoursBail({orgId,bailId,code,edlId,preparationEdl,proprietaireDirect=false}:{orgId:string;bailId:string;code:CodeModele;signataires:{id:string;nom:string}[];edlId:string|null;preparationEdl:ReactNode;signatureManuelle:ReactNode;proprietaireDirect?:boolean}){
  // Décision D27 : chez le propriétaire direct, les liens de cet espace vivent sous /espace/<id>.
  const base = useBaseEspace(orgId);
  const racine = useRacineEspace();
 const [pdf,setPdf]=useState<EtatGeneration|null>(null),[enCours,demarrer]=useTransition();
 const controle=useContext(CompletudeBail);
 const revision=useContext(EtapeComplementsBail)?.revision??0;
 const [revisionPdf,setRevisionPdf]=useState(-1);
 const pdfCourant=revisionPdf===revision;
 const retour=`${base}/baux/${bailId}`;
 function generer(){demarrer(async()=>{setPdf(null);try{setPdf(await genererDocument(orgId,code,bailId,retour));setRevisionPdf(revision);}catch{setPdf({erreur:"La génération a été interrompue. Réessayez."});}});}
 const manquants=controle?.manquants??pdf?.manquants??[];
 return <section className="bail-finalisation" id="signature"><header><FileText size={22}/><div><h3>Vos documents à signer</h3><p>Générez les PDF après avoir vérifié le récapitulatif.</p></div></header>
  {manquants.length>0&&<section aria-labelledby="titre-oublis-bail" className="rounded-xl border border-border bg-warning-soft p-4 text-sm">
    <h4 id="titre-oublis-bail" className="flex items-center gap-2 font-semibold"><PastilleBail manquant/>À compléter pour le PDF · {manquants.length}</h4>
    <p className="mt-1 text-xs text-muted-foreground">Cliquez sur une information pour revenir au champ à compléter. La liste se met à jour après chaque enregistrement.</p>
    <ul className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">{manquants.map(m=><li key={m}><a className="inline-flex min-h-11 w-full items-center justify-between gap-3 underline decoration-border underline-offset-4 hover:decoration-current" href={cibleChampBail(m,orgId,racine).href}><span>{m}</span><span aria-hidden="true">→</span></a></li>)}</ul>
  </section>}
  {pdf?.documentId&&!pdfCourant&&<p role="status" className="text-sm">Le dossier a été modifié. Générez un nouveau PDF avant de demander les signatures.</p>}
  <div className="bail-finalisation-docs"><div><h4>1. Le contrat de location</h4><Button onClick={generer} disabled={enCours}>{enCours?"Génération…":"Générer le PDF du bail"}</Button>{pdf?.erreur&&<p role="alert" className="text-sm text-destructive">{pdf.erreur}</p>}{pdf?.documentId&&!pdf.erreur&&pdfCourant&&<a className="lien-discret block mt-2" href={`${base}/documents/${pdf.documentId}/fichier`} target="_blank" rel="noreferrer">Ouvrir et relire le PDF</a>}</div>
   <div id="edl"><h4>2. L’état des lieux d’entrée</h4>{edlId?<><BoutonGenererDocument orgId={orgId} code="edl" cibleId={edlId} cheminRetour={retour} libelle="Générer le PDF de l’état des lieux"/><a className="lien-discret block mt-2" href={`${retour}/edl/${edlId}`}>Compléter la grille de l’état des lieux</a></>:<><p className="text-sm mb-2">Préparez d’abord la grille : pièces, observations, compteurs et clés.</p>{preparationEdl}</>}<p className="text-xs text-muted-foreground mt-2">L’état des lieux se complète et se signe avec les parties à la remise des clés. Son circuit de signature se trouve dans la grille.</p></div>
  </div>
  {proprietaireDirect&&<SignatureElectroniqueBail orgId={orgId} bailId={bailId}/>}
 </section>;
}
