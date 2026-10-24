import {LIMITE_VEILLES,sujetDansPerimetre} from "@/lib/cadre-editorial";
import {lireFileVeille} from "@/lib/file-veille";
import { ArretSupervision, verifierAvantEffet } from "@/lib/controle-effets";
import {messageEtudeIA} from '@/lib/erreur-ia';
import {lireSourceEtude,etudierVeille,type SourceEtude} from '@/lib/analyse-veille';
import {FLUX_VEILLE,lireFluxVeille,chargerFluxVeille} from '@/lib/veille-reglementaire';
import {porteurDuSecret,consignerTache} from '@/lib/tache';
import {clientDeService} from '@/lib/supabase/service';
import {reserverAppelIA} from '@/lib/plafond-ia';
export async function traiterVeille(request:Request){
 if(!porteurDuSecret(request,process.env.CRON_SECRET))return Response.json({erreur:'Non autorisé.'},{status:401});
 const db=clientDeService();if(!db)return Response.json({erreur:'Connexion indisponible.'},{status:503});
 let preparees=0;const echecs:string[]=[];
 let file:Awaited<ReturnType<typeof lireFileVeille>>;
 try { file=await lireFileVeille(db); }
 catch { await consignerTache(db,'veille',{preparees:0,echecs:['Lecture des propositions en attente']});return Response.json({preparees:0,echecs:['Lecture des propositions en attente']},{status:503}); }
 const pertinentes=file.filter(info=>sujetDansPerimetre(info.titre));
 const places=Math.max(0,LIMITE_VEILLES-pertinentes.length);
 // La mission est sérialisée par commencer_mission. Les deux flux partagent
 // la même capacité ; aucune étude ni collecte supplémentaire quand elle est pleine.
 const candidates=[];
 if(places>0)for(const flux of FLUX_VEILLE){try{
  candidates.push(...lireFluxVeille(await chargerFluxVeille(flux.url),flux.nom));
 }catch{echecs.push(flux.nom);}}
 const connus=new Set(file.map(i=>i.source_url));
 const uniques=[...new Map(candidates.map(i=>[i.source_url,i])).values()].filter(i=>!connus.has(i.source_url));
 // Une source déjà traitée n'occupe pas les places disponibles et n'est jamais rouverte.
 let nouvelles:typeof candidates=[];
 if(uniques.length){
  const existantes=await db.from('regulatory_watch').select('source_url').in('source_url',uniques.map(i=>i.source_url));
  if(existantes.error)echecs.push('Lecture des sources déjà traitées');
  else {const dejaVues=new Set((existantes.data??[]).map(i=>i.source_url));
   nouvelles=uniques.filter(i=>!dejaVues.has(i.source_url)).sort((a,b)=>(b.publie_source_le??'').localeCompare(a.publie_source_le??'')).slice(0,places);
   if(nouvelles.length){const {data,error}=await db.from('regulatory_watch').upsert(nouvelles,{onConflict:'source_url',ignoreDuplicates:true}).select('id,titre,source_url,analyse_le,analyse_tentee_le');if(error)echecs.push('Enregistrement indisponible');else {preparees=data?.length??0;pertinentes.push(...(data??[]) as typeof pertinentes);}}
  }
 }
 let etudiees=0, rejetees=0;
 // Les cinq premières places seulement : une ancienne file trop longue ne
 // provoque pas d'appels IA pour les sujets en réserve ou hors périmètre.
 const attente=pertinentes.slice(0,LIMITE_VEILLES).filter(i=>!i.analyse_le&&(!i.analyse_tentee_le||Date.parse(i.analyse_tentee_le)<Date.now()-86400000)).slice(0,3);
 if(attente.length){
  const sources:SourceEtude[]=[];
  await Promise.all(attente.map(async info=>{try{sources.push({id:info.id,titre:info.titre,url:info.source_url,texte:await lireSourceEtude(info.source_url)});}catch{echecs.push('Lecture d’une source officielle');await db.from('regulatory_watch').update({analyse_erreur:'La source officielle doit être relue avant de préparer une étude.',analyse_tentee_le:new Date().toISOString()}).eq('id',info.id);}}));
  if(sources.length)try{await verifierAvantEffet(db,'veille');const {analyses,rejets}=await etudierVeille(sources,()=>reserverAppelIA(db,'veille'));
   for(const analyse of analyses){const {error}=await db.rpc('conserver_etude_veille',{p_id:analyse.id,p_analyse:analyse});if(error)echecs.push('Enregistrement d’une étude');else etudiees++;}
   // Une étude refusée ne fait plus tomber les autres (27/09) : elle seule reste
   // à reprendre, avec son motif, au prochain passage.
   for(const rejet of rejets){
    const {error:erreurTrace}=await db.from('tech_log').insert({evenement:'veille_analyse_rejetee',details:{motif:rejet.motif.slice(0,200),sources:1}});
    const {error:erreurReprise}=await db.from('regulatory_watch').update({analyse_erreur:'Étude non retenue par le contrôle des sources. Elle sera reprise au prochain passage.',analyse_tentee_le:new Date().toISOString()}).eq('id',rejet.id);
    if(erreurTrace||erreurReprise)echecs.push('Enregistrement du contrôle d’une étude');else rejetees++;}}
  catch(e){if(e instanceof ArretSupervision)throw e;echecs.push('Analyse des conséquences à reprendre');
   // Le motif exact, sans aucun contenu de source ni de réponse : c'est ce qui
   // manquait le 25/09 pour comprendre un échec depuis la console.
   await db.from('tech_log').insert({evenement:'veille_analyse_echec',details:{motif:e instanceof Error?e.message.slice(0,200):'inconnu',sources:sources.length}});
   for(const source of sources)await db.from('regulatory_watch').update({analyse_erreur:messageEtudeIA(e),analyse_tentee_le:new Date().toISOString()}).eq('id',source.id);}
 }
 await consignerTache(db,'veille',{preparees,etudiees,rejetees,echecs,sources:FLUX_VEILLE.length,places, hors_perimetre:file.length-(file.filter(i=>sujetDansPerimetre(i.titre)).length)});
 return Response.json({preparees,etudiees,rejetees,echecs},{status:echecs.length?503:200});
}
