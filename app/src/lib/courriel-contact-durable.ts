import { clientDeService } from './supabase/service';
import { conserverCourriel,identiteCourriel,type ChargeCourriel } from './reprise-courriels';
import { envoyerCourrielDurable,type ResultatCourriel } from './courriels-durables';
/** Charge du transfert validé par le webhook signé ; destinataire administré uniquement. */
export async function transporterContact(p:ChargeCourriel,reference:string,env:Record<string,string|undefined>=process.env):Promise<ResultatCourriel>{
 if(env.RESEND_CONTACT_TRANSFERT_ACTIF!=='true'||(env.VERCEL_ENV&&env.VERCEL_ENV!=='production')||env.RESEND_CONTACT_TRANSFERT_VERS?.trim().toLowerCase()!==p.to.toLowerCase())return {erreur:'Transfert désactivé ou destination modifiée'};
 if(!env.RESEND_API_KEY)return {erreur:'Prestataire non configuré',recuperable:true};
 try {
  const body=JSON.parse(p.html);
  if(body.to?.length!==1||body.to[0]!==p.to)return {erreur:'Destination incohérente'};
  const r=await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(2000),headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':p.cleIdempotence??reference},body:JSON.stringify({...body,tags:[{name:'gerimmo_message',value:reference}]})});
  if(r.status===429)return {erreur:'Débit limité',recuperable:true};
  if(r.status>=500||r.status===409)return {erreur:'Résultat incertain',incertain:true};
  if(!r.ok)return {erreur:'Refus fournisseur'};
  const data=await r.json();return typeof data.id==='string'?{id:data.id}:{erreur:'Référence absente',incertain:true};
 }catch{return {erreur:'Réponse perdue',incertain:true};}
}
export async function envoyerContactDurable(body:{to:string[];subject:string},cle:string,env:Record<string,string|undefined>){
 const db=clientDeService();if(!db)return {erreur:'Suivi indisponible'};
 const p:ChargeCourriel={canal:'contact',to:body.to[0],subject:body.subject,html:JSON.stringify(body),cleIdempotence:cle};
 try {await conserverCourriel(db,p);}catch{return {erreur:'Conservation indisponible'};}
 const k=identiteCourriel(p);
 return envoyerCourrielDurable(db,{cle:k.key,destinataire:p.to,organisation:null,contenu:k.contenu},reference=>transporterContact(p,reference,env));
}
