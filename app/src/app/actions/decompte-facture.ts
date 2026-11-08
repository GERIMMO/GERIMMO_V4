"use server";
import { preparerPdfFactureExistant } from "@/lib/pdf-facture-existant";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { estUuid } from "@/lib/identifiants";
import { sansJargon } from "@/lib/erreurs";
export type EtatPartFacture = {erreur?:string; documentId?:string; envoyeLe?:string|null; montant?:number};
export async function preparerPartFacture(org:string,repartition:string,bailId:string):Promise<EtatPartFacture> {
  const {supabase,user}=await verifierGerant(org,{geste:"suivi_consommations",cible:repartition});
  if(!user || ![repartition,bailId].every(estUuid)) return {erreur:"Accès refusé."};
  const resultat=await preparerPdfFactureExistant(supabase,org,repartition,bailId);
  revalidatePath(`/espace/${org}`,"layout");
  return resultat;
}

export async function envoyerPartFacture(org:string,repartition:string,bail:string):Promise<EtatPartFacture>{
  const {supabase,user}=await verifierGerant(org,{geste:"suivi_consommations",cible:repartition});
  if(!user||![repartition,bail].every(estUuid)) return {erreur:"Accès refusé."};
  const r=await supabase.rpc("diffuser_pdf_repartition",{p_org:org,p_repartition:repartition,p_bail:bail});
  if(r.error) return {erreur:sansJargon(r.error.message)};
  revalidatePath(`/locataire/${org}`,"layout");revalidatePath(`/espace/${org}`,"layout");
  return {envoyeLe:r.data};
}

export async function lirePartsFacture(org:string,repartition:string):Promise<{parts?:Record<string,EtatPartFacture>;erreur?:string}> {
  const {supabase,user}=await verifierGerant(org,{geste:"suivi_consommations",cible:repartition});
  if(!user||!estUuid(repartition)) return {erreur:"Accès refusé."};
  const r=await supabase.from("documents_repartition_fourniture").select("bail_id,document_id,envoye_le").eq("organization_id",org).eq("repartition_id",repartition);
  if(r.error) return {erreur:"Le suivi des partages est indisponible. Rechargez la page."};
  return {parts:Object.fromEntries(r.data.map(d=>[d.bail_id,{documentId:d.document_id,envoyeLe:d.envoye_le}]))};
}
