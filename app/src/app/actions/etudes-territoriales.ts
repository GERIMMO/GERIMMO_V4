'use server';
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {DEPARTEMENTS} from '@/lib/territoire';
export async function enregistrerEtude(_etat:{erreur?:string;succes?:string},form:FormData):Promise<{erreur?:string;succes?:string}>{
 const db=await createClient();const {data:ok,error}=await db.rpc('is_permanent_super_admin');
 if(error||ok!==true)return {erreur:'Accès réservé à la supervision.'};
 const departement=String(form.get('departement')??''),indicateur=String(form.get('indicateur')??''),nombre=Number(form.get('nombre')),depense=Number(String(form.get('depense')??'').replace(',','.'));
 if(!DEPARTEMENTS.some(d=>d.code===departement)||!['concurrence','acquisition'].includes(indicateur)||!Number.isSafeInteger(nombre)||nombre<0||!Number.isFinite(depense)||depense<0||Math.round(depense*100)>99999999)return {erreur:'Vérifiez le département et les résultats saisis.'};
 const {error:e}=await db.rpc('enregistrer_etude_territoriale',{p_departement:departement,p_indicateur:indicateur,p_nombre:nombre,p_depense_cents:Math.round(depense*100),p_debut:String(form.get('debut')??''),p_fin:String(form.get('fin')??''),p_source:String(form.get('source')??''),p_methode:String(form.get('methode')??'')});
 if(e)return {erreur:'Vérifiez les dates, la source et la méthode. Le coût par client demande au moins un client réellement gagné.'};
 revalidatePath('/admin/territoire');return {succes:'L’étude est conservée avec sa source et ses dates. Elle complète le classement tant qu’elle reste récente.'};
}
