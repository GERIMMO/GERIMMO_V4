"use client";
import { useRef, useState } from "react";
import { FileCheck2 } from "lucide-react";
import { CLASSE_BOUTON_PRINCIPAL, Erreur } from "../../ui";
import styles from "./devis.module.css";

export function ApercuDevis({sollicitationId, valide, onValide, bloque = false, onGeneration}: {sollicitationId:string; valide:boolean; onValide:(revision:number)=>void; bloque?:boolean; onGeneration?:(actif:boolean)=>void}) {
  const bloc=useRef<HTMLDivElement>(null);
  const [erreur,setErreur]=useState(""); const [chargement,setChargement]=useState(false);
  async function generer() {
    if (chargement || bloque) return;
    const form=bloc.current?.closest("form"); if(!form||!form.reportValidity()) return;
    const data=new FormData(form);
    const signature=JSON.stringify([...data.entries()]);
    setErreur("");setChargement(true);onGeneration?.(true);
    try {
      const reponse=await fetch(`/api/devis/${sollicitationId}/pdf`,{method:"POST",body:data});
      if(!reponse.ok) {const r=await reponse.json().catch(()=>null);throw new Error(r?.erreur||"La validation n’a pas abouti.");}
      await reponse.blob();
      const revision=Number(reponse.headers.get("X-Devis-Revision"));
      if(!revision) throw new Error("La validation n’a pas été confirmée.");
      // Le serveur a enregistré un instantané. Ne pas autoriser l'envoi d'une
      // saisie plus récente qui n'aurait pas été validée par l'artisan.
      if(JSON.stringify([...new FormData(form).entries()])!==signature) {
        onValide(-revision);
        throw new Error("Votre saisie a changé pendant la génération. Validez à nouveau vos modifications.");
      }
      onValide(revision);
    } catch(e) {setErreur(e instanceof Error?e.message:"La génération a échoué. Réessayez.");}
    finally {setChargement(false);onGeneration?.(false);}
  }
  return <div ref={bloc} className={styles.validationCarte}>
    <h3 className="flex items-center gap-2 text-lg"><FileCheck2 size={20} aria-hidden/>Validation de votre devis</h3>
    <p className="mt-2 text-sm text-muted-foreground">Après votre validation, Gerimmo génère le PDF avec les coordonnées et le logo de votre entreprise. Rien n’est envoyé à cette étape.</p>
    <label className="my-4 flex items-start gap-3 text-sm"><input key={String(valide)} type="checkbox" name="validation_artisan" value="oui" defaultChecked={valide} required className="mt-0.5 size-5 shrink-0 accent-[var(--encre)]"/>J’ai vérifié les prestations, les quantités, les prix, la TVA et les conditions de mon devis.</label>
    <button type="button" disabled={chargement||bloque} onClick={generer} className={CLASSE_BOUTON_PRINCIPAL}>{chargement?"Génération du PDF…":valide?"Régénérer le PDF validé":"Valider et générer le PDF"}</button>
    {valide&&<p role="status" className="mt-3 text-sm text-emerald-800">PDF validé et enregistré. Passez à l’envoi pour le consulter et le transmettre.</p>}
    {erreur&&<div className="mt-3"><Erreur>{erreur}</Erreur></div>}
  </div>;
}
