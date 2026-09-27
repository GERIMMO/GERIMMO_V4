'use server';
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
export async function deciderVeille(id:string,_etat:{erreur?:string;succes?:string},form:FormData):Promise<{erreur?:string;succes?:string}>{
 const db=await createClient();const {data:ok,error}=await db.rpc('is_permanent_super_admin');if(error||ok!==true)return {erreur:'Accès réservé à la supervision.'};
 const publier=form.get('decision')==='publier';
 if(!['publier','ecarter'].includes(String(form.get('decision'))))return {erreur:'Choisissez une décision.'};
 // Audit console 27/09 : la décision porte sur l'état affiché (l'onglet). Si
 // l'information a changé d'état depuis, la base refuse au lieu d'écraser.
 const attendu=String(form.get('etat_attendu')??'');
 const {error:e}=await db.rpc('decider_veille',{p_id:id,p_publier:publier,p_resume:String(form.get('resume')??''),p_action:String(form.get('action')??''),p_publics:form.getAll('publics').map(String),p_application:form.get('application')||null,p_statut_attendu:['a_examiner','publie','ecarte'].includes(attendu)?attendu:null});
 if(e)return {erreur:/changé d’état/.test(e.message)?'Cette information a changé d’état depuis son affichage : rechargez la page avant de décider.':'Vérifiez le résumé, l’action conseillée, les publics et la date.'};
 revalidatePath('/admin/brief');
 revalidatePath('/admin/veille');revalidatePath('/veille');return {succes:publier?'L’information validée est disponible pour les utilisateurs concernés.':'L’information est retirée de la diffusion.'};
}
