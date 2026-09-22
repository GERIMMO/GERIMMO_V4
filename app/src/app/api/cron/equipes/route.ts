import {GET as appels} from '../appels/route';
import {GET as quittances} from '../quittances/route';
import {GET as relances} from '../relances/route';
import {GET as rappels} from '../rappels/route';
import {GET as abonnements} from '../abonnements/route';
import {GET as signatures} from '../signatures/route';
import {GET as marketing} from '../marketing/route';
import {GET as territoire} from '../territoire/route';
import {porteurDuSecret} from '@/lib/tache';
import {clientDeService} from '@/lib/supabase/service';
import {estMission} from '@/lib/missions';
import {executerMission} from '@/lib/execution-mission';
export const dynamic='force-dynamic';export const maxDuration=60;
const traitements={appels,quittances,relances,rappels,abonnements,signatures,marketing,territoire};
export async function GET(request:Request){
 if(!porteurDuSecret(request,process.env.CRON_SECRET))return Response.json({erreur:'Non autorisé.'},{status:401});
 const cle=new URL(request.url).searchParams.get('mission')??'';
 if(!estMission(cle))return Response.json({erreur:'Mission inconnue.'},{status:400});
 const db=clientDeService();if(!db)return Response.json({erreur:'Connexion du traitement indisponible.'},{status:503});
 const {error:continuite}=await db.rpc('surveiller_continuite');
 if(continuite)console.error('[equipes] Le suivi de continuité est indisponible.');
 return executerMission(db,cle,()=>traitements[cle](request));
}
