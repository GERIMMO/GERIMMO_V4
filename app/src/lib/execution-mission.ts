import type {SupabaseClient} from '@supabase/supabase-js';
import {bilanMission,type Mission} from './missions';
import {genererPointsDuMatin} from './point-du-matin';
export async function executerMission(db:SupabaseClient,mission:Mission,traiter:()=>Promise<Response>){
 const {data:id,error}=await db.rpc('commencer_mission',{p_cle:mission});
 if(error)return Response.json({erreur:'Le contrôle de la mission est indisponible.'},{status:503});
 if(!id)return Response.json({ignore:true,motif:'Mission en pause ou déjà en cours.'});
 let response:Response;
 try{response=await traiter();}catch{response=Response.json({erreur:'Le traitement a été interrompu.'},{status:500});}
 const bilan=bilanMission(await response.clone().json().catch(()=>({erreur:true})),response.status);
 // 25/09 : le passage garde ses comptes réels (B1) ; le point du matin de
 // chaque équipe est réassemblé à la fin de chaque passage (E1).
 const {error:trace}=await db.rpc('terminer_mission',{p_id:id,p_ok:bilan.ok,p_compte:bilan.compte,p_bilan:bilan.bilan});
 if(trace)return Response.json({erreur:'Le traitement a eu lieu mais son résultat doit être vérifié.'},{status:503});
 const point=await genererPointsDuMatin(db);
 if(point.erreur)console.error('[point du matin]',point.erreur);
 return response;
}
