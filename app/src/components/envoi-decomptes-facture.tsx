"use client";
import { useState, useTransition, useEffect } from "react";
import { lirePartsFacture, preparerPartFacture, envoyerPartFacture, type EtatPartFacture } from "@/app/actions/decompte-facture";
import { ApercuDocumentEspace } from "./apercu-document-espace";
import { Button } from "./ui/button";
import { eur, formaterDate } from "@/lib/ged";
import styles from "./consommations.module.css";
export type DestinataireDecompte = {bail:string;nom:string;logement:string};
export function EnvoiDecomptesFacture({org,base,repartitionId,destinataires}:{org:string;base:string;repartitionId:string;destinataires:DestinataireDecompte[]}) {
  const [etats,maj]=useState<Record<string,EtatPartFacture>>({});
  const [charge,setCharge]=useState(false);
  const [erreurSuivi,setErreurSuivi]=useState("");
  useEffect(()=>{let actif=true;lirePartsFacture(org,repartitionId).then(r=>{if(!actif)return;setErreurSuivi(r.erreur ?? "");if(r.parts)maj(s=>({...r.parts,...s}));setCharge(true);}).catch(()=>{if(actif){setErreurSuivi("Suivi indisponible. Rechargez la page.");setCharge(true);}});return()=>{actif=false;};},[org,repartitionId]);
  const [pending,lancer]=useTransition();
  const changer=(bail:string,e:EtatPartFacture)=>maj(s=>({...s,[bail]:{...s[bail],erreur:undefined,...e}}));
  const restants=destinataires.filter(d=>!etats[d.bail]?.envoyeLe);
  const prets=restants.length>0 && restants.every(d=>etats[d.bail]?.documentId && !etats[d.bail]?.erreur);
  function traiter(envoi:boolean) { lancer(async()=>{
    for(const d of destinataires) {
      if(etats[d.bail]?.envoyeLe) continue;
      try {changer(d.bail,envoi ? await envoyerPartFacture(org,repartitionId,d.bail) : await preparerPartFacture(org,repartitionId,d.bail));}
      catch {changer(d.bail,{erreur:"Action interrompue. Vous pouvez réessayer sans créer de doublon."});}
    }
  });}
  return <section className={styles.form}><h2>4 · Envoi et suivi</h2>
    <p className={styles.muted}>Partagez le détail de cette facture dans l’espace de chaque locataire. Cet envoi ne réclame aucun paiement et ne clôture pas les comptes annuels. Les provisions seront déduites lors de la régularisation.</p>
    <form action={()=>traiter(true)} className={styles.list}>
      {erreurSuivi && <p role="alert">{erreurSuivi}</p>}
      {destinataires.map(d=>{const e=etats[d.bail];return <article key={d.bail} className={styles.destinataire}>
        <div className={styles.line}><strong>{d.logement} · {d.nom}</strong><span className={styles.badge}>{e?.envoyeLe?`Envoyé le ${formaterDate(e.envoyeLe.slice(0,10))}`:e?.documentId?"Préparé · à vérifier":charge?"À préparer":"Chargement du suivi…"}</span></div>
        {e?.montant!=null && <p>Part de la facture · {eur(e.montant)}</p>}
        {e?.documentId && <ApercuDocumentEspace fichier={`${base}/documents/${e.documentId}/fichier`} titre={`Répartition de facture · ${d.logement}`} mime="application/pdf"/>}
        {e?.erreur && <p className={styles.error} role="alert">{e.erreur}</p>}
      </article>})}
      {!destinataires.length && <p>Aucune part locataire à partager pour cette facture.</p>}
      {prets && <label className="!flex flex-row gap-2"><input type="checkbox" required disabled={pending}/>J’ai vérifié les PDF et leurs destinataires.</label>}
      <div className={styles.piedParcours}>
        {!!restants.length && <Button type="button" variant="outline" disabled={pending||!charge||!!erreurSuivi} onClick={()=>traiter(false)}>{pending?"Traitement…":"Préparer / retrouver les PDF"}</Button>}
        {!!restants.length && <Button type="submit" disabled={pending||!prets||!charge||!!erreurSuivi}>Confirmer le partage ({restants.length})</Button>}
      </div>
      {!!destinataires.length && !restants.length && <p role="status" className={styles.ok}>Les documents sont disponibles dans les espaces des locataires concernés. L’exercice annuel reste ouvert.</p>}
    </form>
  </section>;
}
