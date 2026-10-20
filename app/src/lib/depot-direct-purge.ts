import type {SupabaseClient} from '@supabase/supabase-js';
import {BUCKET_TRANSIT} from './depot-direct-commun';
import {verifierAvantEffet} from './controle-effets';
// Une réservation autorise la création de jetons jusqu'à expire_le.
// Le dernier jeton reste valable deux heures après cette date : ajouter
// encore une heure de marge avant toute suppression du fichier ou du registre.
const MARGE_APRES_RESERVATION = 3 * 3_600_000;
const LOT = 500;
const MAX_LOTS = 10;
/** Reprise bornée ; le bilan garde visibles les dépôts restant à retirer. */
export async function purgerDepotsTemporaires(db:SupabaseClient) {
 const debut=Date.now(),echeance=debut+20_000;
 const seuil=new Date(debut-MARGE_APRES_RESERVATION).toISOString();
 let purges=0,echecs=0;
 for(let lot=0;lot<MAX_LOTS&&Date.now()<echeance;lot++){
  const r=await db.from('depots_temporaires').select('id,chemin').lt('expire_le',seuil).order('expire_le').order('id').limit(LOT);
  if(r.error){echecs++;break;}
  const lignes=(r.data??[]) as {id:string;chemin:string}[];
  if(!lignes.length)break;
  await verifierAvantEffet(db,'purge');
  const retrait=await db.storage.from(BUCKET_TRANSIT).remove(lignes.map(l=>l.chemin));
  if(retrait.error){echecs+=lignes.length;break;}
  const trouves=new Set((retrait.data??[]).map(o=>o.name));const soldes:string[]=[];
  for(const l of lignes){
   if(trouves.has(l.chemin)){soldes.push(l.id);continue;}
   if(Date.now()>=echeance)break;
   const [dossier,nom,...autres]=l.chemin.split('/');if(!dossier||!nom||autres.length)continue;
   await verifierAvantEffet(db,'purge');
   const liste=await db.storage.from(BUCKET_TRANSIT).list(dossier,{search:nom,limit:100});
   if(!liste.error&&Array.isArray(liste.data)&&!liste.data.some(o=>o.name===nom))soldes.push(l.id);
  }
  let n=0;
  if(soldes.length){
   await verifierAvantEffet(db,'purge');
   const fin=await db.from('depots_temporaires').delete().in('id',soldes).select('id');
   n=fin.error?0:(fin.data??[]).length;
  }
  purges+=n;echecs+=lignes.length-n;
  // Ne pas reprendre le même lot en boucle si une suppression est incertaine.
  if(n<lignes.length||lignes.length<LOT)break;
 }
 const reste=await db.from('depots_temporaires').select('id',{count:'exact',head:true}).lt('expire_le',seuil);
 const anciens=await db.from('depots_temporaires').select('id',{count:'exact',head:true}).lt('expire_le',new Date(debut-48*3_600_000).toISOString());
 if(reste.error||anciens.error)echecs++;
 return {transferts_purges:purges,echecs_transferts:echecs,
  transferts_en_attente:reste.error?null:reste.count??0,
  transferts_bloques:anciens.error?null:anciens.count??0};
}
