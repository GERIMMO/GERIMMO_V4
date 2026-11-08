"use server";
import { verifierGerant } from "@/lib/ged-acces";
import { revalidatePath } from "next/cache";
import { estUuid } from "@/lib/identifiants";
export async function reglerFactureAutomatique(org:string,id:string,actif:boolean) {
 const {supabase,user}=await verifierGerant(org,{geste:"suivi_consommations",cible:id});
 if(!user||!estUuid(id))return {erreur:"Accès refusé."};
 const f=await supabase.from("factures_fourniture").select("id").eq("organization_id",org).eq("id",id).single();
 if(f.error)return {erreur:"Facture indisponible."};
 const r=await supabase.rpc("regler_facture_automatique",{p_facture:id,p_actif:actif});
 if(r.error)return {erreur:r.error.message};
 revalidatePath(`/espace/${org}`,"layout");return {succes:true};
}
