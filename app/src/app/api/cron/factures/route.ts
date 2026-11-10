import {maintenanceLivraison,MESSAGE_TRANSITION} from "@/lib/transition-livraison";
import { porteurDuSecret } from "@/lib/tache";
import { clientDeService } from "@/lib/supabase/service";
import { traiterFileFactures } from "@/lib/automatisation-factures";
import { verifierAvantEffet } from "@/lib/controle-effets";
export const runtime="nodejs";
export const maxDuration=180;
let enCours=false;
export async function GET(request:Request) {
 if(maintenanceLivraison())return Response.json({erreur:MESSAGE_TRANSITION},{status:503});
 if(process.env.NODE_ENV==="production" || !/^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL??""))return new Response(null,{status:404});
 if(!porteurDuSecret(request,process.env.CRON_SECRET))return Response.json({erreur:"Non autorisé"},{status:401});
 if(enCours)return Response.json({enCours:true});
 const db=clientDeService();if(!db)return Response.json({erreur:"Service indisponible"},{status:503});
 enCours=true;
 try{return Response.json(await traiterFileFactures(db,()=>verifierAvantEffet(db,"rappels")));}
 catch{return Response.json({erreur:"Traitement suspendu. Aucun encaissement automatique."},{status:503});}
 finally{enCours=false;}
}
