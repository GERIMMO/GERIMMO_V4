"use server";
import { verifierGerant } from "@/lib/ged-acces";
import { CATALOGUE_DOCUMENTS } from "@/lib/documents/catalogue";
import { verifierCibleCatalogue } from "@/lib/documents/catalogue-cibles";
import { RefusDocument, anneeDocument } from "@/lib/documents/modeles/catalogue-bail";
import { chargerRecapitulatifNu, interetsQualifies, montantPourSaisie } from "@/lib/documents/modeles/catalogue-gestion";
import { MODELES, type CodeModele } from "@/lib/documents/modeles";
import { genererDocument, type EtatGeneration } from "./documents-generes";
import { baseEspace } from "@/lib/racine-espace";
export async function genererDepuisCatalogue(orgId:string,modeleId:string,cibleId:string,options:Record<string,string>):Promise<EtatGeneration> {
  const {supabase,user,role}=await verifierGerant(orgId);
  if(!user) return {erreur:"Accès refusé."};
  const modele=CATALOGUE_DOCUMENTS.find(m=>m.id===modeleId);
  if(!modele || !Object.hasOwn(MODELES,modele.code)) return {erreur:"Ce modèle n’est pas disponible à la génération."};
  try {
    await verifierCibleCatalogue(supabase,orgId,modele,cibleId);
    return await genererDocument(orgId,modele.code as CodeModele,cibleId,`${baseEspace(orgId,role==="proprietaire_direct")}/documents/catalogue`,options);
  } catch(e) {
    if(e instanceof RefusDocument) return {erreur:e.message};
    console.error("[catalogue] lecture du dossier impossible",e);
    return {erreur:"Le dossier n’a pas pu être vérifié. Réessayez dans un instant."};
  }
}

// D37 (CHF-01, option B) : le montant que le livre porte en ligne 250 (intérêts d'emprunt) pour un lot nu et une année, proposé comme valeur
// du champ du « Récapitulatif annuel · location nue ». Même lecture que le document (`chargerRecapitulatifNu`), mêmes contrôles d'accès :
// la proposition ne dit jamais autre chose que ce que le PDF comparera. Le montant rendu est au format que la saisie relit (« 2345,67 »).
// `qualifie: false` : aucune dépense n'est qualifiée en 250, le champ part de 0 (« 0 si le logement n'a aucun emprunt »).
export async function proposerInteretsEmprunt(orgId:string,lotId:string,anneeBrute:string):Promise<{montant:string;qualifie:boolean}|{erreur:string}> {
  const {supabase,user}=await verifierGerant(orgId);
  if(!user) return {erreur:"Accès refusé."};
  const modele=CATALOGUE_DOCUMENTS.find(m=>m.id==="recap_fiscal_nu");
  if(!modele) return {erreur:"Ce modèle n’est pas disponible à la génération."};
  try {
    if(!/^\d{4}$/.test(anneeBrute)) throw new RefusDocument("Choisissez une année valide.");
    const annee=anneeDocument({annee:anneeBrute});
    await verifierCibleCatalogue(supabase,orgId,modele,lotId);
    const qualifie=interetsQualifies(await chargerRecapitulatifNu(supabase,orgId,lotId,annee));
    return qualifie===null?{montant:"0",qualifie:false}:{montant:montantPourSaisie(Math.max(0,qualifie)),qualifie:true};
  } catch(e) {
    if(e instanceof RefusDocument) return {erreur:e.message};
    console.error("[catalogue] lecture des intérêts d’emprunt impossible",e);
    return {erreur:"Le montant du livre n’a pas pu être lu. Réessayez dans un instant."};
  }
}
