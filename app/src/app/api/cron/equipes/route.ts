import {GET as veille} from '../veille/route';
import {GET as appels} from '../appels/route';
import {GET as quittances} from '../quittances/route';
import {GET as relances} from '../relances/route';
import {GET as rappels} from '../rappels/route';
import {GET as abonnements} from '../abonnements/route';
import {GET as signatures} from '../signatures/route';
import {GET as marketing} from '../marketing/route';
import {GET as territoire} from '../territoire/route';
import {GET as purge} from '../purge/route';
import {appelAutorise as appelMarketingAutorise} from '../marketing/route';
import {porteurDuSecret} from '@/lib/tache';
import {clientDeService} from '@/lib/supabase/service';
import {estMission} from '@/lib/missions';
import {executerMission} from '@/lib/execution-mission';
export const dynamic='force-dynamic';export const maxDuration=180;
const traitements={veille,appels,quittances,relances,rappels,abonnements,signatures,marketing,territoire,purge};
export async function GET(request:Request){
 const cle=new URL(request.url).searchParams.get('mission')??'';
 const db=clientDeService();
 // 06/10 : la mission marketing est aussi déclenchée à la minute par pg_cron,
 // avec un jeton généré en base (jamais saisi) ; les autres gardent CRON_SECRET.
 const autorise=porteurDuSecret(request,process.env.CRON_SECRET)||(cle==='marketing'&&db!==null&&await appelMarketingAutorise(request,db));
 if(!autorise)return Response.json({erreur:'Non autorisé.'},{status:401});
 if(!estMission(cle))return Response.json({erreur:'Mission inconnue.'},{status:400});
 if(!db)return Response.json({erreur:'Connexion du traitement indisponible.'},{status:503});
 const {error:continuite}=await db.rpc('surveiller_continuite');
 if(continuite)console.error('[equipes] Le suivi de continuité est indisponible.');
 return executerMission(db,cle,()=>traitements[cle](request));
}
