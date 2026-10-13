"use server";
import {revalidatePath} from 'next/cache';
import {verifierGerant} from '@/lib/ged-acces';
import {sansJargon} from '@/lib/erreurs';
export type EtatFiscal={erreur?:string;succes?:string};
const texte=(f:FormData,k:string)=>String(f.get(k)??'').trim();
const nombreOptionnel=(f:FormData,k:string)=>texte(f,k)===''?null:Number(texte(f,k).replace(',','.'));
async function acces(orgId:string){const a=await verifierGerant(orgId);return {...a,autorise:!!a.user&&a.role==='proprietaire_direct'};}
function actualiser(orgId:string){revalidatePath(`/agence/${orgId}/comptabilite/fiscal`);revalidatePath(`/agence/${orgId}/loyers`);}
export async function qualifierPieceFiscale(orgId:string,ecritureId:string,_etat:EtatFiscal,f:FormData):Promise<EtatFiscal>{
 const {supabase,autorise}=await acces(orgId);if(!autorise)return{erreur:'Accès refusé.'};
 if(texte(f,'confirme')!=='oui')return{erreur:'Confirmez votre vérification de la pièce et de son traitement fiscal.'};
 const {error}=await supabase.rpc('qualifier_ecriture_fiscale',{p_ecriture:ecritureId,p_nature:texte(f,'nature'),p_rubrique:texte(f,'rubrique')||null,p_justification:texte(f,'justification'),p_loyer_hc:nombreOptionnel(f,'loyer_hc'),p_charges:nombreOptionnel(f,'charges'),p_lot:texte(f,'lot_id')||null});
 if(error)return{erreur:sansJargon(error.message)};actualiser(orgId);return{succes:'Qualification conservée dans une nouvelle version. Le journal reste inchangé.'};
}
export async function retrouverVentilation(orgId:string,ecritureId:string,_etat:EtatFiscal,_f:FormData):Promise<EtatFiscal>{
 const {supabase,autorise}=await acces(orgId);if(!autorise)return{erreur:'Accès refusé.'};
 const {error}=await supabase.rpc('retrouver_ventilation_fiscale',{p_ecriture:ecritureId});
 if(error)return{erreur:sansJargon(error.message)};actualiser(orgId);return{succes:'Ventilation historique retrouvée et conservée avec les références des pièces.'};
}
export async function enregistrerExerciceFiscal(orgId:string,lotId:string,annee:number,_etat:EtatFiscal,f:FormData):Promise<EtatFiscal>{
 const {supabase,autorise}=await acces(orgId);if(!autorise)return{erreur:'Accès refusé.'};
 if(texte(f,'confirme')!=='oui')return{erreur:'Confirmez les périodes et les pièces de cet exercice.'};
 let periodes:unknown;try{periodes=JSON.parse(texte(f,'periodes'));}catch{return{erreur:'Vérifiez les périodes.'};}
 const {error}=await supabase.rpc('enregistrer_exercice_fiscal_lot',{p_lot:lotId,p_annee:annee,p_periodes:periodes,p_justification:texte(f,'justification'),p_regularisation230:nombreOptionnel(f,'regularisation230'),p_quote_part230:nombreOptionnel(f,'quote_part230'),p_justification230:texte(f,'justification230')||null});
 if(error)return{erreur:sansJargon(error.message)};actualiser(orgId);return{succes:'Exercice enregistré dans une nouvelle version. Les précédentes sont conservées.'};
}
