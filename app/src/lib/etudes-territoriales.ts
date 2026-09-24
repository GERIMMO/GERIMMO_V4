import type {Marche} from './score-territoire';
import {DUREE_FRAICHEUR_JOURS} from './mesures-territoire';
export type EtudeTerritoriale={departement:string;indicateur:string;valeur:number;clients:number|null;depense_cents:number|null;debut:string;fin:string;source:string;methode:string;created_at:string};
/** The observed period, not the upload date, determines freshness. Studies
 * supplement public data; daily collection never erases the underlying proof. */
export function appliquerEtudes(marche:Marche,etudes:EtudeTerritoriale[],maintenant=new Date()):Marche{
 const copie:Marche={...marche,departements:Object.fromEntries(Object.entries(marche.departements).map(([k,v])=>[k,{...v,observations:{...v.observations},perimees:[...(v.perimees??[])]}]))};
 for(const e of etudes){
  const d=copie.departements[e.departement],cle=e.indicateur==='concurrence'?'concurrence':e.indicateur==='acquisition'?'cout_acquisition_cents':null;
  if(!d||!cle||!Number.isSafeInteger(e.valeur)||e.valeur<0)continue;
  const age=maintenant.getTime()-Date.parse(e.fin+'T00:00:00Z');
  if(!Number.isFinite(age)||age<0||age>DUREE_FRAICHEUR_JOURS[cle]*86400000)continue;
  if(cle==='cout_acquisition_cents'&&(!e.clients||e.depense_cents===null||e.depense_cents<0||Math.round(e.depense_cents/e.clients)!==e.valeur))continue;
  const precedent=d.observations?.[cle];
  if(precedent&&Date.parse(precedent.observe_le)>Date.parse(e.fin))continue;
  d[cle]=e.valeur;d.perimees=d.perimees?.filter(k=>k!==cle);
  d.observations![cle]={source:`Étude renseignée par la supervision : ${e.source}`,observe_le:e.fin,recupere_le:e.created_at,definition:e.methode};
  if(cle==='cout_acquisition_cents'){d.clients_gagnes=e.clients;d.cout_publicitaire_cents=e.depense_cents;d.periode_publicite_debut=e.debut;d.periode_publicite_fin=e.fin;d.prospects=null;d.clics_publicitaires=null;d.cout_prospect_cents=null;}
 }
 return copie;
}
