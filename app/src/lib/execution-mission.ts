import type {SupabaseClient} from '@supabase/supabase-js';
import {bilanMission,type Mission} from './missions';
import {genererPointsDuMatin} from './point-du-matin';
import {ArretSupervision,verifierAvantEffet} from './controle-effets';
export async function executerMission(db:SupabaseClient,mission:Mission,traiter:()=>Promise<Response>){
 const {error:vacances}=await db.rpc('traiter_vacances');
 if(vacances)return Response.json({erreur:'Le contrôle du relais est indisponible.'},{status:503});
 try { await verifierAvantEffet(db,mission); } catch(e) { return Response.json({erreur:e instanceof ArretSupervision?e.message:'Contrôle indisponible.',arret:e instanceof ArretSupervision?e.raison:'indisponible'},{status:503}); }
 const {data:id,error}=await db.rpc('commencer_mission',{p_cle:mission});
 if(error)return Response.json({erreur:'Le contrôle de la mission est indisponible.'},{status:503});
 if(!id)return Response.json({ignore:true,motif:'Mission en pause ou déjà en cours.'});
 let response:Response;
 try{await verifierAvantEffet(db,mission);response=await traiter();}catch(e){
  if(e instanceof ArretSupervision){
   const {error:trace}=await db.rpc('interrompre_mission_supervision',{p_id:id,p_indisponible:e.raison==='indisponible',p_bilan:e.bilanPartiel?bilanMission(e.bilanPartiel,503).bilan:null});
   return Response.json({erreur:trace?'Arrêt demandé ; sa trace doit être vérifiée.':e.message,arret:e.raison,compte_inconnu:true,bilan_partiel:e.bilanPartiel??null},{status:503});
  }
  response=Response.json({erreur:'Le traitement a été interrompu.'},{status:500});
 }
 const bilan=bilanMission(await response.clone().json().catch(()=>({erreur:true})),response.status);
 const {error:trace}=await db.rpc('terminer_mission',{p_id:id,p_ok:bilan.ok,p_compte:bilan.compte,p_bilan:bilan.bilan});
 if(trace)return Response.json({erreur:'Le traitement a eu lieu mais son résultat doit être vérifié.'},{status:503});
 const point=await genererPointsDuMatin(db);
 if(point.erreur)console.error('[point du matin]',point.erreur);
 return response;
}
