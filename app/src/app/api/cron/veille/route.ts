import {messageEtudeIA} from '@/lib/erreur-ia';
import {lireSourceEtude,etudierVeille,type SourceEtude} from '@/lib/analyse-veille';
import {FLUX_VEILLE,lireFluxVeille,chargerFluxVeille} from '@/lib/veille-reglementaire';
import {porteurDuSecret,consignerTache} from '@/lib/tache';
import {clientDeService} from '@/lib/supabase/service';
export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(request:Request){
 if(!porteurDuSecret(request,process.env.CRON_SECRET))return Response.json({erreur:'Non autorisé.'},{status:401});
 const db=clientDeService();if(!db)return Response.json({erreur:'Connexion indisponible.'},{status:503});
 let preparees=0;const echecs:string[]=[];
 await Promise.all(FLUX_VEILLE.map(async flux=>{try{
  const infos=lireFluxVeille(await chargerFluxVeille(flux.url),flux.nom);
  // Ignore duplicates: a daily collection never overwrites an editorial decision.
  if(infos.length){const {data,error}=await db.from('regulatory_watch').upsert(infos,{onConflict:'source_url',ignoreDuplicates:true}).select('id');if(error)throw new Error('Enregistrement indisponible.');preparees+=data?.length??0;}
 }catch{echecs.push(flux.nom);}}));
 let etudiees=0;
 const {data:attente,error:lecture}=await db.from('regulatory_watch').select('id,titre,source_url').eq('statut','a_examiner').is('analyse_le',null).or(`analyse_tentee_le.is.null,analyse_tentee_le.lt.${new Date(Date.now()-86400000).toISOString()}`).order('publie_source_le',{ascending:false,nullsFirst:false}).order('reperage_le').order('id').limit(3);
 if(lecture)echecs.push('Lecture des études à préparer');
 else if(attente?.length){
  const sources:SourceEtude[]=[];
  await Promise.all(attente.map(async info=>{try{sources.push({id:info.id,titre:info.titre,url:info.source_url,texte:await lireSourceEtude(info.source_url)});}catch{echecs.push('Lecture d’une source officielle');await db.from('regulatory_watch').update({analyse_erreur:'La source officielle doit être relue avant de préparer une étude.',analyse_tentee_le:new Date().toISOString()}).eq('id',info.id);}}));
  if(sources.length)try{for(const analyse of await etudierVeille(sources)){const {error}=await db.rpc('conserver_etude_veille',{p_id:analyse.id,p_analyse:analyse});if(error)echecs.push('Enregistrement d’une étude');else etudiees++;}}
  catch(e){echecs.push('Analyse des conséquences à reprendre');
   // Le motif exact, sans aucun contenu de source ni de réponse : c'est ce qui
   // manquait le 25/09 pour comprendre un échec depuis la console.
   await db.from('tech_log').insert({evenement:'veille_analyse_echec',details:{motif:e instanceof Error?e.message.slice(0,200):'inconnu',sources:sources.length}});
   for(const source of sources)await db.from('regulatory_watch').update({analyse_erreur:messageEtudeIA(e),analyse_tentee_le:new Date().toISOString()}).eq('id',source.id);}
 }
 await consignerTache(db,'veille',{preparees,etudiees,echecs,sources:FLUX_VEILLE.length});
 return Response.json({preparees,etudiees,echecs},{status:echecs.length?503:200});
}
