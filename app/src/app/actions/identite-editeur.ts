'use server';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import {validerIdentite} from '@/lib/identite-editeur';
import {reservesLegales} from '@/lib/editeur';
export async function enregistrerIdentite(_: {erreur?:string;succes?:string;revision?:number},f:FormData):Promise<{erreur?:string;succes?:string;revision?:number}>{
 const db=await createClient();const auth=await db.rpc('is_permanent_super_admin');if(auth.error||auth.data!==true)return {erreur:'Compte de supervision permanent requis.'};
 const r=validerIdentite(f);if(r.erreur)return {erreur:r.erreur};const revision=Number(f.get('revision'));if(!Number.isSafeInteger(revision)||revision<0)return {erreur:'Rechargez les paramètres avant de modifier.'};
 const saved=await db.from('supervision_identite').update({valeurs:r.valeurs,revision:revision+1}).eq('singleton',true).eq('revision',revision).select('revision').maybeSingle();
 // 23514 = check_violation : la base de cet environnement ne connaît pas encore une clé du formulaire (migration
 // 20261019123000 à appliquer AVANT le code) ou la taille autorisée est dépassée. Un message générique le cacherait.
 if(saved.error?.code==='23514')return {erreur:'La base a refusé l’enregistrement : un champ dépasse la taille autorisée ou n’est pas encore reconnu par la base de cet environnement (migration à appliquer). Votre saisie reste affichée.'};
 if(saved.error||!saved.data)return {erreur:'Les informations ont changé ou n’ont pas pu être enregistrées. Rechargez avant de réessayer ; votre saisie reste affichée.'};
 for(const p of ['/admin/parametres','/mentions-legales','/conditions','/confidentialite'])revalidatePath(p);
 revalidatePath('/admin/sante');revalidatePath('/admin/brief');
 // 19/10 : dire ce qui manque encore, plutôt qu'un succès qui laisse croire que les pages sont finalisées.
 const reste=reservesLegales(r.valeurs??{});
 const succes=reste.length?`Identité enregistrée et reprise sur les trois pages légales de cet environnement. Il reste à compléter : ${reste.join(', ')}. Tant qu’un élément manque, la page qui le cite l’affiche « (à venir) » ; seuls les faits requis (hors médiateur) et les prestataires gardent l’encadré « Document en cours de finalisation ».`:'Identité enregistrée et reprise sur les trois pages légales de cet environnement ; rien ne reste à compléter.';
 return {succes,revision:saved.data.revision as number};
}
