"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { estUuid } from "@/lib/identifiants";
import { sansJargon } from "@/lib/erreurs";
export type EtatEchangeIntervention={erreur?:string;succes?:string};
export async function agirEchangeIntervention(intervention:string,_:EtatEchangeIntervention,f:FormData):Promise<EtatEchangeIntervention>{
 if(!estUuid(intervention))return{erreur:"Cette discussion n’est pas accessible."};
 const db=await createClient();const action=String(f.get("action")??"");
 let resultat;
 if(action==="envoyer"){
  const commande=String(f.get("commande")??"");if(!estUuid(commande))return{erreur:"Réessayez l’envoi du message."};
  resultat=await db.rpc("envoyer_message_intervention",{p_intervention:intervention,p_texte:String(f.get("texte")??""),p_commande:commande});
 }else if(action==="fermer"||action==="rouvrir")resultat=await db.rpc("fermer_echange_intervention",{p_intervention:intervention,p_fermer:action==="fermer"});
 else return{erreur:"Action inconnue."};
 if(resultat.error)return{erreur:sansJargon(resultat.error.message)};
 revalidatePath("/espace","layout");revalidatePath("/agence","layout");revalidatePath("/locataire","layout");revalidatePath("/artisan","layout");
 return{succes:action==="envoyer"?"Message ajouté à la discussion.":action==="fermer"?"Discussion fermée. L’historique est conservé.":"Discussion rouverte."};
}

/**
 * Audit palier 1 (P1-05) : la discussion vient de passer sous les yeux de l'appelant, jusqu'à ce message (le dernier
 * affiché, désigné par son identifiant — jamais par une heure, qu'un intermédiaire pourrait arrondir). La base
 * n'avance que SON marqueur, et seulement s'il a le droit de lire cette discussion. Quand le marqueur a avancé, les
 * pastilles et les étiquettes « nouveau message » se recalculent ; sinon rien n'est rafraîchi.
 * Aucun retour : c'est un geste silencieux, qui ne doit jamais gêner la lecture.
 */
export async function marquerEchangeLu(intervention:string,dernierMessage:string):Promise<void>{
 if(!estUuid(intervention)||!estUuid(dernierMessage))return;
 const db=await createClient();
 const {data,error}=await db.rpc("marquer_echange_intervention_lu",{p_intervention:intervention,p_message:dernierMessage});
 if(error||data!==true)return;
 revalidatePath("/espace","layout");revalidatePath("/agence","layout");revalidatePath("/locataire","layout");revalidatePath("/artisan","layout");
}
