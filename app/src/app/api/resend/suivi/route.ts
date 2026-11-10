import { Resend } from "resend";
import { clientDeService } from "@/lib/supabase/service";
import { rapprocherEvenementCourriel } from "@/lib/rapprochement-courriels";
export const runtime='nodejs';
export async function POST(request:Request) {
 const secret=process.env.RESEND_WEBHOOK_SUIVI_SECRET;
 const db=clientDeService();if(!secret||!db)return new Response(null,{status:503});
 const payload=await request.text();if(payload.length>262144)return new Response(null,{status:413});
 let evenement;
 try {evenement=new Resend(process.env.RESEND_API_KEY??'verification-seule').webhooks.verify({payload,headers:{id:request.headers.get('svix-id')??'',timestamp:request.headers.get('svix-timestamp')??'',signature:request.headers.get('svix-signature')??''},webhookSecret:secret});}
 catch{return new Response(null,{status:400});}
 try {if('email_id' in evenement.data)await rapprocherEvenementCourriel(db,evenement.type,evenement.data);return new Response(null,{status:204});}
 catch{return new Response(null,{status:503});}
}
