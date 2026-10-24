'use server';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import {lireProspect} from '@/lib/prospects-supervision';
export type EtatProspect={erreur?:string;succes?:string;id?:string;revision?:number;supprime?:boolean};
// Plan de conformité du 23/10 (R45) : une fiche ne se crée depuis une demande de contact que si son auteur demande une
// offre ou une démonstration ; « dernier contact émanant du prospect » ne bouge que quand le prospect a répondu.
export async function enregistrerProspect(_:EtatProspect,f:FormData):Promise<EtatProspect>{
 const db=await createClient();const auth=await db.rpc('is_permanent_super_admin');if(auth.error||auth.data!==true)return {erreur:'Compte de supervision permanent requis.'};
 const r=lireProspect(f);if(r.erreur||!r.champs)return {erreur:r.erreur};const t=(k:string)=>String(f.get(k)??'').trim(),id=t('id'),revision=Number(t('revision')||0);
 if(!Number.isSafeInteger(revision)||revision<0)return {erreur:'Version invalide : rechargez le prospect.'};
 if(r.champs.responsable){const resp=await db.from('memberships').select('account_id').eq('account_id',r.champs.responsable).eq('role','super_admin').eq('status','active').maybeSingle();if(resp.error||!resp.data)return {erreur:'Le responsable doit être un superviseur actif.'};}
 if(r.champs.organisation_id){const org=await db.from('organizations').select('id').eq('id',r.champs.organisation_id).maybeSingle();if(org.error||!org.data)return {erreur:'Cet espace client ne peut pas être vérifié.'};}
 const demande=t('demande_id');let demandeLe:string|null=null;if(!id&&demande){
  if(t('demande_offre')!=='1')return {erreur:'Une fiche prospect ne se crée depuis une demande de contact que si son auteur demande une offre ou une démonstration. Répondez-lui sinon depuis « Demandes de contact ».'};
  const source=await db.from('demandes_devis').select('id,created_at').eq('id',demande).maybeSingle();if(source.error||!source.data)return {erreur:'La demande d’origine ne peut pas être vérifiée.'};
  // Le dernier contact émanant du prospect est sa demande (relecture du 24/10) : ses 36 mois ne repartent pas de la
  // création de la fiche.
  demandeLe=typeof source.data.created_at==='string'?source.data.created_at:null;}
 const contact=id&&t('a_repondu')==='1'?{dernier_contact_prospect_le:new Date().toISOString()}:{};
 const saved=id?await db.from('supervision_prospects').update({...r.champs,...contact,revision:revision+1}).eq('id',id).eq('revision',revision).select('id,revision').maybeSingle():await db.from('supervision_prospects').insert({...r.champs,demande_id:demande||null,...(demandeLe?{dernier_contact_prospect_le:demandeLe}:{})}).select('id,revision').single();
 if(saved.error||!saved.data)return {erreur:saved.error?.code==='23505'?'Cette demande possède déjà une fiche prospect. Retrouvez-la dans le suivi commercial.':'Le prospect a changé ou n’a pas pu être enregistré. Rechargez avant de réessayer.'};
 revalidatePath('/admin/territoire');revalidatePath(`/admin/territoire/prospects/${saved.data.id}`);revalidatePath('/admin/journaux');return {succes:'Prospect enregistré. Aucun e-mail ni invitation n’a été envoyé.',id:saved.data.id,revision:saved.data.revision};
}
/** « Stop » : opposition enregistrée (empreinte de l'adresse gardée 36 mois) ; la fiche et toute fiche de la même adresse partent aussitôt, historique compris. */
export async function enregistrerOppositionProspect(id:string):Promise<EtatProspect>{
 if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))return {erreur:'Prospect introuvable.'};
 const db=await createClient();const auth=await db.rpc('is_permanent_super_admin');if(auth.error||auth.data!==true)return {erreur:'Compte de supervision permanent requis.'};
 const r=await db.rpc('enregistrer_opposition_prospection',{p_prospect:id});
 if(r.error)return {erreur:r.error.code==='P0002'?'Cette fiche n’existe plus : l’opposition a peut-être déjà été enregistrée depuis un autre écran.':'L’opposition n’a pas pu être enregistrée. Réessayez dans un instant.'};
 revalidatePath('/admin/territoire');revalidatePath(`/admin/territoire/prospects/${id}`);
 return {succes:'Opposition enregistrée : la fiche et son historique sont supprimés. Seule l’empreinte de l’adresse est gardée trois ans, pour qu’aucun message ne lui soit plus envoyé.',supprime:true};
}
export async function rechercherEspacesProspect(recherche:string):Promise<{id:string;name:string}[]>{const db=await createClient();const auth=await db.rpc('is_permanent_super_admin');if(auth.error||auth.data!==true||recherche.trim().length<2)return [];const {rechercheIlike}=await import('@/lib/pagination-supervision');const r=await db.from('organizations').select('id,name').or(`name.ilike.${rechercheIlike(recherche.trim().slice(0,100))}`).order('name').order('id').limit(25);if(r.error)throw new Error('Recherche des espaces indisponible.');return r.data??[];}
