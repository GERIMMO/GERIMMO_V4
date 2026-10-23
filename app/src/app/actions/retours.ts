"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sansJargon } from "@/lib/erreurs";
import { actionSansDonnees, ecranSansDonnees, NATURES_RETOUR } from "@/lib/retours";
import { journaliserSupervision } from "@/lib/journal-supervision";
import { lireEditeur } from "@/lib/editeur-serveur";
import { phraseMediateurReclamation } from "@/lib/courriers-contrat";

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
 revalidatePath('/assistance');revalidatePath('/agence/[orgId]/faq','page');revalidatePath('/admin/retours');revalidatePath('/admin');
 return{succes:"Votre demande est enregistrée. Retrouvez son suivi et les réponses ci-dessous.",id:String(data)};
}
export async function soutenirRetour(id:string,_etat:EtatRetour):Promise<EtatRetour>{
 const c=await createClient();const{error}=await c.rpc('soutenir_idee',{p_retour:id});
 if(error)return{erreur:sansJargon(error.message)};
 revalidatePath('/assistance');revalidatePath('/agence/[orgId]/faq','page');revalidatePath('/admin/retours');return{succes:"Votre soutien est enregistré."};
}
/** Réponse maximale admise par `traiter_retour`. */
const REPONSE_MAX=6000;
export async function deciderRetour(id:string,version:number,_etat:EtatRetour,fd:FormData):Promise<EtatRetour>{
 const c=await createClient();const{data:sa,error:acces}=await c.rpc('is_super_admin');
 if(acces||sa!==true)return{erreur:"Accès réservé à la supervision Gerimmo."};
 const decision=String(fd.get('etat')??'');
 let reponse=String(fd.get('reponse')??'');
 // Plan du 23/10 (R05) : la réponse qui clôt une réclamation renvoie au médiateur de la consommation (ou dit que
 // l'adhésion est en cours, tant que ses coordonnées ne sont pas saisies). La nature est relue en base.
 if(decision==='resolu'){
  const{data:lu,error:lecture}=await c.from('retours_utilisateurs').select('nature').eq('id',id).maybeSingle();
  if(lecture)return{erreur:"La demande n’a pas pu être relue. Réessayez."};
  if((lu as {nature?:string}|null)?.nature==='reclamation'){
   const phrase=phraseMediateurReclamation((await lireEditeur()).editeur);
   if(!reponse.includes(phrase)){
    const complete=`${reponse.trim()}\n\n${phrase}`;
    if(complete.length>REPONSE_MAX)return{erreur:`Raccourcissez la réponse : la phrase sur le médiateur de la consommation y est ajoutée (${REPONSE_MAX} caractères au plus en tout).`};
    reponse=complete;
   }
  }
 }
 const{error}=await c.rpc('traiter_retour',{p_retour:id,p_version:version,p_etat:decision,p_gravite:String(fd.get('gravite')??''),p_reponse:reponse,p_reexamen:String(fd.get('reexaminer_le')??'')||null});
 if(error)return{erreur:sansJargon(error.message)};
 revalidatePath('/admin/retours');revalidatePath('/admin/donnees');revalidatePath('/compte/donnees');revalidatePath('/assistance');revalidatePath('/agence/[orgId]/faq','page');revalidatePath('/admin/publications');return{succes:"Décision enregistrée et visible dans le suivi de la demande."};
}
export async function regrouperRetours(id:string,_etat:EtatRetour,fd:FormData):Promise<EtatRetour>{
 const c=await createClient();const{data:sa,error:acces}=await c.rpc('is_super_admin');
 if(acces||sa!==true)return{erreur:"Accès réservé à la supervision Gerimmo."};
 const{error}=await c.rpc('regrouper_idees',{p_source:id,p_cible:String(fd.get('cible')??'')});
 if(error)return{erreur:sansJargon(error.message)};
 await journaliserSupervision(c,'idees_regroupees',{source:id,cible:String(fd.get('cible')??'').slice(0,36)});
 revalidatePath('/admin/retours');return{succes:"Idées regroupées. Leurs textes restent dans leurs espaces d’origine."};
}

export async function cloreRevue(_etat:EtatRetour,fd:FormData):Promise<EtatRetour>{
 const c=await createClient();const{data:sa,error:acces}=await c.rpc('is_super_admin');
 if(acces||sa!==true)return{erreur:"Accès réservé à la supervision Gerimmo."};
 const{error}=await c.rpc('clore_revue_idees',{p_bilan:String(fd.get('bilan')??'')});
 if(error)return{erreur:sansJargon(error.message)};
 await journaliserSupervision(c,'revue_idees_close');
 revalidatePath('/admin/retours');revalidatePath('/admin');return{succes:"La revue de ce mois est enregistrée."};
}
