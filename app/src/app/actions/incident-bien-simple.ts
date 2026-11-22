"use server";
import { jourValide } from "@/lib/presentation-document";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { aujourdhuiParis } from "@/lib/ged";
import { estUuid } from "@/lib/identifiants";
import { sansJargon } from "@/lib/erreurs";
import { categorieIncident, URGENCES_INCIDENT } from "@/lib/incidents";
export type EtatIncidentBien={erreur?:string;succes?:string};
export async function declarerIncidentBien(org:string,bien:string,_etat:EtatIncidentBien,f:FormData):Promise<EtatIncidentBien>{
 const {supabase}=await verifierGerant(org);
 const titre=String(f.get('titre')??'').trim(),note=String(f.get('note')??'').trim(),date=String(f.get('date')??''),lot=String(f.get('lot')??''),commande=String(f.get('commande')??'');
 if(!estUuid(bien)||(lot&&!estUuid(lot))||!estUuid(commande))return {erreur:"Choisissez le logement concerné."};
 if(!titre||titre.length>150||note.length>5000)return {erreur:"Indiquez un titre de 150 caractères maximum et une note de 5 000 caractères maximum."};
 if(!jourValide(date)||date>aujourdhuiParis())return {erreur:"Choisissez une date passée ou aujourd’hui."};
 // Audit palier 1 du 22/11/2026, P1-19 : la catégorie et l'urgence se choisissent ici comme sur l'écran « Incidents »
 // (mêmes listes, mêmes refus). Avant, cette porte écrivait toujours « autre » et « normale ».
 const categorie=String(f.get('categorie')??'').trim(),urgence=String(f.get('urgence')??'normale');
 if(!categorieIncident(categorie))return {erreur:"Choisissez la catégorie la plus proche du problème."};
 if(!Object.hasOwn(URGENCES_INCIDENT,urgence))return {erreur:"Urgence invalide."};
 const {error}=await supabase.rpc('declarer_incident_bien_simple',{p_org:org,p_bien:bien,p_lot:lot||null,p_titre:titre,p_date:date,p_note:note,p_commande:commande,p_categorie:categorie,p_urgence:urgence});
 if(error)return {erreur:sansJargon(error.message)};
 revalidatePath(`/espace/${org}`,"layout");revalidatePath(`/agence/${org}`,"layout");
 return {succes:urgence==="urgente"?"Incident urgent déclaré.":"Incident déclaré."};
}
