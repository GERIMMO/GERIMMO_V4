"use server";
import { revalidatePath } from "next/cache";
import { verifierGerant } from "@/lib/ged-acces";
import { aujourdhuiParis } from "@/lib/ged";
import { estUuid } from "@/lib/identifiants";
import { sansJargon } from "@/lib/erreurs";
export type EtatIncidentBien={erreur?:string;succes?:string};
export async function declarerIncidentBien(org:string,bien:string,_etat:EtatIncidentBien,f:FormData):Promise<EtatIncidentBien>{
 const {supabase}=await verifierGerant(org);
 const titre=String(f.get('titre')??'').trim(),note=String(f.get('note')??'').trim(),date=String(f.get('date')??''),lot=String(f.get('lot')??''),commande=String(f.get('commande')??'');
 if(!estUuid(bien)||(lot&&!estUuid(lot))||!estUuid(commande))return {erreur:"Choisissez le logement concerné."};
 if(!titre||titre.length>150||note.length>5000)return {erreur:"Indiquez un titre de 150 caractères maximum et une note de 5 000 caractères maximum."};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>aujourdhuiParis())return {erreur:"Choisissez une date passée ou aujourd’hui."};
 const {error}=await supabase.rpc('declarer_incident_bien_simple',{p_org:org,p_bien:bien,p_lot:lot||null,p_titre:titre,p_date:date,p_note:note,p_commande:commande});
 if(error)return {erreur:sansJargon(error.message)};
 revalidatePath(`/espace/${org}`,"layout");revalidatePath(`/agence/${org}`,"layout");
 return {succes:"Incident déclaré."};
}
