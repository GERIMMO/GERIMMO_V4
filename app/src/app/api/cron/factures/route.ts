import {maintenanceLivraison,MESSAGE_TRANSITION} from "@/lib/transition-livraison";
import {reprendreNotificationsCapturees} from "@/lib/notifications-transactionnelles";
import { exigerContexteCourriel, reprendreFinalisationsCourriels } from "@/lib/finalisation-courriels";
import { transporterContact } from "@/lib/courriel-contact-durable";
import { reprendreCourriels } from "@/lib/reprise-courriels";
import { envoyerEmailTransport } from "@/lib/email";
import { verifierCourrielsAcceptes } from "@/lib/rapprochement-courriels";
import { porteurDuSecret } from "@/lib/tache";
import { clientDeService } from "@/lib/supabase/service";
import { traiterFileFactures } from "@/lib/automatisation-factures";
import { verifierAvantEffet } from "@/lib/controle-effets";
export const runtime="nodejs";
export const maxDuration=60;
let enCours=false;
export async function GET(request:Request) {
 if(maintenanceLivraison())return Response.json({erreur:MESSAGE_TRANSITION},{status:503});

 if(!porteurDuSecret(request,process.env.CRON_SECRET))return Response.json({erreur:"Non autorisé"},{status:401});
 if(enCours)return Response.json({enCours:true});
 const db=clientDeService();if(!db)return Response.json({erreur:"Service indisponible"},{status:503});
 enCours=true;
 try{
  await verifierAvantEffet(db,"rappels");
  let notifications={traitees:0,erreurs:0};
  try{notifications=await reprendreNotificationsCapturees(db);}catch{notifications.erreurs++;}
  let suiviCourriels=true;
  try {await verifierCourrielsAcceptes(db);} catch {suiviCourriels=false;}
  let reprises={traites:0},reprisesDisponibles=true;
  try {reprises=await reprendreCourriels(db,(p,reference)=>p.canal==='contact'?transporterContact(p,reference):envoyerEmailTransport({...p,referenceInterne:reference,cleIdempotence:p.cleIdempotence??reference,organisation:p.organisationId?{db,id:p.organisationId}:undefined,delaiMaxMs:2000,avantEnvoi:async()=>{await verifierAvantEffet(db,"rappels");await exigerContexteCourriel(db,reference);}}),()=>verifierAvantEffet(db,"rappels"));} catch {reprisesDisponibles=false;}
  let finalisationsDisponibles=true;
  try {await reprendreFinalisationsCourriels(db);}catch{finalisationsDisponibles=false;}
  const bilan=await traiterFileFactures(db,()=>verifierAvantEffet(db,"rappels"),15_000);
  return Response.json({...bilan,notifications,suivi_courriels:suiviCourriels,finalisations_disponibles:finalisationsDisponibles,reprises_courriels:reprises.traites,reprises_disponibles:reprisesDisponibles});
 }
 catch{return Response.json({erreur:"Traitement suspendu. Aucun encaissement automatique."},{status:503});}
 finally{enCours=false;}
}
