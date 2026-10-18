'use server';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import {lireProspect} from '@/lib/prospects-supervision';
export type EtatProspect={erreur?:string;succes?:string;id?:string;revision?:number};
export async function enregistrerProspect(_:EtatProspect,f:FormData):Promise<EtatProspect>{
 const db=await createClient();const auth=await db.rpc('is_permanent_super_admin');if(auth.error||auth.data!==true)return {erreur:'Compte de supervision permanent requis.'};
 const r=lireProspect(f);if(r.erreur||!r.champs)return {erreur:r.erreur};const t=(k:string)=>String(f.get(k)??'').trim(),id=t('id'),revision=Number(t('revision')||0);
 if(!Number.isSafeInteger(revision)||revision<0)return {erreur:'Version invalide : rechargez le prospect.'};
 if(r.champs.responsable){const resp=await db.from('memberships').select('account_id').eq('account_id',r.champs.responsable).eq('role','super_admin').eq('status','active').maybeSingle();if(resp.error||!resp.data)return {erreur:'Le responsable doit être un superviseur actif.'};}
 if(r.champs.organisation_id){const org=await db.from('organizations').select('id').eq('id',r.champs.organisation_id).maybeSingle();if(org.error||!org.data)return {erreur:'Cet espace client ne peut pas être vérifié.'};}
 const demande=t('demande_id');if(!id&&demande){const source=await db.from('demandes_devis').select('id').eq('id',demande).maybeSingle();if(source.error||!source.data)return {erreur:'La demande d’origine ne peut pas être vérifiée.'};}
 const saved=id?await db.from('supervision_prospects').update({...r.champs,revision:revision+1}).eq('id',id).eq('revision',revision).select('id,revision').maybeSingle():await db.from('supervision_prospects').insert({...r.champs,demande_id:demande||null}).select('id,revision').single();
 if(saved.error||!saved.data)return {erreur:saved.error?.code==='23505'?'Cette demande possède déjà une fiche prospect. Retrouvez-la dans le suivi commercial.':'Le prospect a changé ou n’a pas pu être enregistré. Rechargez avant de réessayer.'};
 revalidatePath('/admin/territoire');revalidatePath(`/admin/territoire/prospects/${saved.data.id}`);revalidatePath('/admin/journaux');return {succes:'Prospect enregistré. Aucun e-mail ni invitation n’a été envoyé.',id:saved.data.id,revision:saved.data.revision};
}
export async function rechercherEspacesProspect(recherche:string):Promise<{id:string;name:string}[]>{const db=await createClient();const auth=await db.rpc('is_permanent_super_admin');if(auth.error||auth.data!==true||recherche.trim().length<2)return [];const {rechercheIlike}=await import('@/lib/pagination-supervision');const r=await db.from('organizations').select('id,name').or(`name.ilike.${rechercheIlike(recherche.trim().slice(0,100))}`).order('name').order('id').limit(25);if(r.error)throw new Error('Recherche des espaces indisponible.');return r.data??[];}
