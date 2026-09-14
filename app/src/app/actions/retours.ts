"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";
import { actionSansDonnees, ecranSansDonnees, NATURES_RETOUR } from "@/lib/retours";

export type EtatRetour = { erreur?:string;succes?:string;id?:string };
export async function envoyerRetour(_etat:EtatRetour,fd:FormData):Promise<EtatRetour>{
 const c=await createClient();const {data:{user}}=await c.auth.getUser();
 if(!user)return{erreur:"Connectez-vous pour envoyer votre demande."};
 const nature=String(fd.get('nature')??'');
 if(!Object.hasOwn(NATURES_RETOUR,nature))return{erreur:"Choisissez le type de demande."};
 if(nature==='idee'&&fd.get('partage')!=='on')return{erreur:"Confirmez la visibilité de cette idée avant de l’envoyer."};
 const {data,error}=await c.rpc('soumettre_retour',{
  p_cle:String(fd.get('cle_envoi')??''),p_nature:nature,p_titre:String(fd.get('titre')??'').trim(),
  p_description:String(fd.get('description')??'').trim(),p_attendu:String(fd.get('attendu')??'').trim()||null,
  p_ecran:ecranSansDonnees(String(fd.get('ecran')??'/')),p_org:String(fd.get('organization_id')??'')||null,
  p_action:actionSansDonnees(String(fd.get('action_origine')??'')),
 });
 if(error||!data)return{erreur:error?sansJargon(error.message):"L’enregistrement n’a pas été confirmé. Réessayez."};
 revalidatePath('/assistance');revalidatePath('/admin/retours');revalidatePath('/admin');
 return{succes:"Votre demande est enregistrée. Retrouvez son suivi et les réponses ci-dessous.",id:String(data)};
}
export async function soutenirRetour(id:string,_etat:EtatRetour):Promise<EtatRetour>{
 const c=await createClient();const{error}=await c.rpc('soutenir_idee',{p_retour:id});
 if(error)return{erreur:sansJargon(error.message)};
 revalidatePath('/assistance');revalidatePath('/admin/retours');return{succes:"Votre soutien est enregistré."};
}
export async function deciderRetour(id:string,version:number,_etat:EtatRetour,fd:FormData):Promise<EtatRetour>{
 const c=await createClient();const{data:sa,error:acces}=await c.rpc('is_super_admin');
 if(acces||sa!==true)return{erreur:"Accès réservé à la supervision Gerimmo."};
 const{error}=await c.rpc('traiter_retour',{p_retour:id,p_version:version,p_etat:String(fd.get('etat')??''),p_gravite:String(fd.get('gravite')??''),p_reponse:String(fd.get('reponse')??''),p_reexamen:String(fd.get('reexaminer_le')??'')||null});
 if(error)return{erreur:sansJargon(error.message)};
 revalidatePath('/admin/retours');revalidatePath('/assistance');revalidatePath('/admin/publications');return{succes:"Décision enregistrée et visible dans le suivi de la demande."};
}
export async function regrouperRetours(id:string,_etat:EtatRetour,fd:FormData):Promise<EtatRetour>{
 const c=await createClient();const{data:sa,error:acces}=await c.rpc('is_super_admin');
 if(acces||sa!==true)return{erreur:"Accès réservé à la supervision Gerimmo."};
 const{error}=await c.rpc('regrouper_idees',{p_source:id,p_cible:String(fd.get('cible')??'')});
 if(error)return{erreur:sansJargon(error.message)};
 revalidatePath('/admin/retours');return{succes:"Idées regroupées. Leurs textes restent dans leurs espaces d’origine."};
}

export async function cloreRevue(_etat:EtatRetour,fd:FormData):Promise<EtatRetour>{
 const c=await createClient();const{data:sa,error:acces}=await c.rpc('is_super_admin');
 if(acces||sa!==true)return{erreur:"Accès réservé à la supervision Gerimmo."};
 const{error}=await c.rpc('clore_revue_idees',{p_bilan:String(fd.get('bilan')??'')});
 if(error)return{erreur:sansJargon(error.message)};
 revalidatePath('/admin/retours');revalidatePath('/admin');return{succes:"La revue de ce mois est enregistrée."};
}
