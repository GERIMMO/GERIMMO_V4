import type { SupabaseClient } from "@supabase/supabase-js";
export async function rapprocherEvenementCourriel(db:SupabaseClient,type:string,data:{email_id?:string;tags?:Record<string,string>}) {
 const etat=type==='email.delivered'?'livre':['email.bounced','email.failed','email.suppressed'].includes(type)?'echec':type==='email.sent'?'accepte':null;
 if(!etat||!data.email_id)return;
 let id=data.tags?.gerimmo_message;
 if(!id){const r=await db.from('courriels_durables').select('id').eq('fournisseur_id',data.email_id).maybeSingle();if(r.error)throw new Error('Rapprochement indisponible');id=r.data?.id;}
 if(!id||!/^[a-f0-9]{64}$/.test(id))return;
 const r=await db.rpc('rapprocher_courriel',{p_id:id,p_fournisseur:data.email_id,p_etat:etat});
 if(r.error)throw new Error('Rapprochement indisponible');
}
/** Consultation seule : aucun POST de renvoi, même après 24 heures. */
export async function verifierCourrielsAcceptes(db:SupabaseClient) {
 const suivi=await db.rpc('surveiller_courriels_interrompus');if(suivi.error)throw new Error('Suivi indisponible');
 const cle=process.env.RESEND_API_KEY;if(!cle)return;
 const r=await db.rpc('courriels_a_rapprocher');
 if(r.error)throw new Error('Suivi indisponible');
 for(const m of r.data??[]) {
  let res: Response;
  try {res=await fetch(`https://api.resend.com/emails/${encodeURIComponent(m.fournisseur_id)}`,{headers:{Authorization:`Bearer ${cle}`},signal:AbortSignal.timeout(2000)});} catch {continue;}
  if(!res.ok)continue;const data=await res.json();
  if(data.id!==m.fournisseur_id)continue;
  await rapprocherEvenementCourriel(db,`email.${data.last_event}`,{email_id:data.id,tags:{gerimmo_message:m.id}});
 }
}
