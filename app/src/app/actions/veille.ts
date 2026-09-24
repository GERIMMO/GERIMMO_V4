'use server';
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
export async function deciderVeille(id:string,_etat:{erreur?:string;succes?:string},form:FormData):Promise<{erreur?:string;succes?:string}>{
 const db=await createClient();const {data:ok,error}=await db.rpc('is_permanent_super_admin');if(error||ok!==true)return {erreur:'Accès réservé à la supervision.'};
 const publier=form.get('decision')==='publier';
 if(!['publier','ecarter'].includes(String(form.get('decision'))))return {erreur:'Choisissez une décision.'};
 const {error:e}=await db.rpc('decider_veille',{p_id:id,p_publier:publier,p_resume:String(form.get('resume')??''),p_action:String(form.get('action')??''),p_publics:form.getAll('publics').map(String),p_application:form.get('application')||null});
 if(e)return {erreur:'Vérifiez le résumé, l’action conseillée, les publics et la date.'};
 revalidatePath('/admin/veille');revalidatePath('/veille');return {succes:publier?'L’information validée est disponible pour les utilisateurs concernés.':'L’information est retirée de la diffusion.'};
}
