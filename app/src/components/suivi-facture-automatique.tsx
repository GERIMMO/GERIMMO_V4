"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reglerFactureAutomatique } from "@/app/actions/facture-automatique";
import { Button } from "./ui/button";
import styles from "./consommations.module.css";
export type SuiviAutomatique={id:string;actif:boolean;etat:string;detail:string|null};
export function SuiviFactureAutomatique({org,id,suivi}:{org:string;id:string;suivi?:SuiviAutomatique}) {
 const router=useRouter();const [pending,start]=useTransition();const [erreur,setErreur]=useState("");
 useEffect(()=>{if(!suivi?.actif||!["a_traiter","releves_attendus"].includes(suivi.etat))return;const t=setInterval(()=>{if(document.visibilityState==="visible")router.refresh();},15000);return ()=>clearInterval(t);},[suivi?.actif,suivi?.etat,router]);
 const titre=!suivi?.actif?"Gestion manuelle":suivi.etat==="terminee"?"Traitement automatique terminé":suivi.etat==="a_verifier"?"Une vérification vous attend":suivi.etat==="releves_attendus"?"Gerimmo attend les relevés":"Gerimmo prend en charge la facture";
 return <aside className={styles.panel} aria-label="Gestion automatique"><div className={styles.body}><strong>{titre}</strong>
 <p>{suivi?.detail ?? "Gerimmo prépare les relevés et les calculs. Vous validez les montants et décidez du partage."}</p>
 {suivi?.etat!=="terminee" && <Button size="sm" variant="outline" disabled={pending} onClick={()=>start(async()=>{const r=await reglerFactureAutomatique(org,id,suivi?.etat==="a_verifier"||!suivi?.actif);if(r.erreur)setErreur(r.erreur);else router.refresh();})}>{suivi?.actif&&suivi.etat!=="a_verifier"?"Reprendre la main":"Activer / reprendre l’automatisation"}</Button>}
 {erreur&&<p role="alert">{erreur}</p>}</div></aside>;
}
