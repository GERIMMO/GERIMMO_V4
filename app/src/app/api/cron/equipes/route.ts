// L'ENTRÉE UNIQUE DES MISSIONS PLANIFIÉES (X04, AUD-C-07, décision du 14/10/2026).
//
// Chaque mission (veille, avis d'échéance, quittances, relances, rappels, abonnements, signatures,
// marketing, territoire, purge) ne s'exécute QUE d'ici, à l'intérieur de `executerMission` : une passe à la fois
// (`commencer_mission`), mission en pause respectée, arrêt d'urgence consulté. Leurs traitements vivent dans
// src/lib/missions-planifiees/, hors de toute route : il n'existe plus de `/api/cron/<mission>` à appeler
// directement avec le secret, sans ce verrou (deux passes simultanées d'une mission qui envoie des courriels
// pouvaient se chevaucher). Le suivi des dossiers (`/api/cron/orchestrateur`) reste à part : il est idempotent et
// verrouillé en base. tests/cron-entree-unique.test.ts garde cette règle.
import {traiterVeille as veille} from '@/lib/missions-planifiees/veille';
import {traiterAppels as appels} from '@/lib/missions-planifiees/appels';
import {traiterQuittances as quittances} from '@/lib/missions-planifiees/quittances';
import {traiterRelances as relances} from '@/lib/missions-planifiees/relances';
import {traiterRappels as rappels} from '@/lib/missions-planifiees/rappels';
import {traiterAbonnements as abonnements} from '@/lib/missions-planifiees/abonnements';
import {traiterSignatures as signatures} from '@/lib/missions-planifiees/signatures';
import {traiterMarketing as marketing} from '@/lib/missions-planifiees/marketing';
import {traiterTerritoire as territoire} from '@/lib/missions-planifiees/territoire';
import {traiterPurge as purge} from '@/lib/missions-planifiees/purge';
import {appelAutorise as appelMarketingAutorise} from '@/lib/missions-planifiees/marketing';
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
