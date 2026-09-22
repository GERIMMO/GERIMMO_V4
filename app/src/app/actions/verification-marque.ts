'use server';
import {revalidatePath} from 'next/cache';
import {createClient} from '@/lib/supabase/server';
import {clientDeService} from '@/lib/supabase/service';
import {verifierSiteMarque,verifierExpediteurMarque} from '@/lib/verification-marque';
export type RetourMarque={erreur?:string;succes?:string};
export async function verifierConnexionMarque(_etat:RetourMarque,form:FormData):Promise<RetourMarque>{
 const db=await createClient();const {data:autorise,error}=await db.rpc('is_permanent_super_admin');
 if(error||autorise!==true)return {erreur:'Cette vérification est réservée à la supervision.'};
 const id=String(form.get('organisation')??''),type=String(form.get('type')??'');
 if(!/^[0-9a-f-]{36}$/i.test(id)||!['site','email'].includes(type))return {erreur:'Choisissez une connexion valide.'};
 const champ=type==='site'?'domaine_personnalise':'email_expediteur';
 const verification=type==='site'?'domaine_personnalise_verifie_le':'email_expediteur_verifie_le';
 const {data:org,error:lecture}=await db.from('organizations').select('id,domaine_personnalise,email_expediteur').eq('id',id).single();
 if(lecture||!org?.[champ])return {erreur:'Renseignez cette connexion dans le profil de l’agence avant de la vérifier.'};
 const service=clientDeService();if(!service)return {erreur:'Le service de vérification est indisponible.'};
 try{
  const ok=type==='site'?await verifierSiteMarque(org[champ]):await verifierExpediteurMarque(org[champ]);
  // Une modification du profil pendant la vérification invalide le résultat.
  const {data:modifie,error:e}=await service.from('organizations').update({[verification]:ok?new Date().toISOString():null}).eq('id',id).eq(champ,org[champ]).select('id').maybeSingle();
  if(e||!modifie)return {erreur:'La connexion a changé ou le résultat n’a pas pu être enregistré. Relancez la vérification.'};
  revalidatePath('/admin/marque-blanche');revalidatePath(`/agence/${id}/profil`);
  return ok?{succes:'La connexion est confirmée par le fournisseur et activée pour cette agence.'}:{erreur:'Le fournisseur ne confirme pas encore cette connexion. Les coordonnées Gerimmo restent utilisées.'};
 }catch(e){return {erreur:e instanceof Error&&e.message.startsWith('La ')?e.message:'La connexion n’a pas pu être vérifiée. Consultez les réglages du fournisseur.'};}
}
