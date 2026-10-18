'use server';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import {validerIdentite} from '@/lib/identite-editeur';
export async function enregistrerIdentite(_: {erreur?:string;succes?:string;revision?:number},f:FormData):Promise<{erreur?:string;succes?:string;revision?:number}>{
 const db=await createClient();const auth=await db.rpc('is_permanent_super_admin');if(auth.error||auth.data!==true)return {erreur:'Compte de supervision permanent requis.'};
 const r=validerIdentite(f);if(r.erreur)return {erreur:r.erreur};const revision=Number(f.get('revision'));if(!Number.isSafeInteger(revision)||revision<0)return {erreur:'Rechargez les paramètres avant de modifier.'};
 const saved=await db.from('supervision_identite').update({valeurs:r.valeurs,revision:revision+1}).eq('singleton',true).eq('revision',revision).select('revision').maybeSingle();
 if(saved.error||!saved.data)return {erreur:'Les informations ont changé ou n’ont pas pu être enregistrées. Rechargez avant de réessayer ; votre saisie reste affichée.'};
 for(const p of ['/admin/parametres','/mentions-legales','/conditions','/confidentialite'])revalidatePath(p);
 revalidatePath('/admin/sante');revalidatePath('/admin/brief');
 return {succes:'Identité enregistrée et reprise sur les trois pages légales de cet environnement.',revision:saved.data.revision as number};
}
