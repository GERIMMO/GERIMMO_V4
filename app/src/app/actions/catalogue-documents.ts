"use server";
import { verifierGerant } from "@/lib/ged-acces";
import { CATALOGUE_DOCUMENTS } from "@/lib/documents/catalogue";
import { verifierCibleCatalogue } from "@/lib/documents/catalogue-cibles";
import { RefusDocument } from "@/lib/documents/modeles/catalogue-bail";
import { MODELES, type CodeModele } from "@/lib/documents/modeles";
import { genererDocument, type EtatGeneration } from "./documents-generes";
export async function genererDepuisCatalogue(orgId:string,modeleId:string,cibleId:string,options:Record<string,string>):Promise<EtatGeneration> {
  const {supabase,user}=await verifierGerant(orgId);
  if(!user) return {erreur:"Accès refusé."};
  const modele=CATALOGUE_DOCUMENTS.find(m=>m.id===modeleId);
  if(!modele || !Object.hasOwn(MODELES,modele.code)) return {erreur:"Ce modèle n’est pas disponible à la génération."};
  try {
    await verifierCibleCatalogue(supabase,orgId,modele,cibleId);
    return await genererDocument(orgId,modele.code as CodeModele,cibleId,`/agence/${orgId}/documents/catalogue`,options);
  } catch(e) {
    if(e instanceof RefusDocument) return {erreur:e.message};
    console.error("[catalogue] lecture du dossier impossible",e);
    return {erreur:"Le dossier n’a pas pu être vérifié. Réessayez dans un instant."};
  }
}
