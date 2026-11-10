import { piloteLimite, circuitAdmisPilote, suspendreCourrielPilote } from "./perimetre-pilote";
import { verifierContexteCourriel, type ContexteCourriel } from './finalisation-courriels';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { empreinteCourriel, envoyerCourrielDurable, type ResultatCourriel } from './courriels-durables';

export type ChargeCourriel = { canal?:'contact'; contexteMetier?:ContexteCourriel; to:string; subject:string; html:string; piecesJointes?:{nom:string;contenuBase64:string}[]; cleIdempotence?:string; organisationId?:string };
function cle() {
 const hex=process.env.COURRIELS_CHIFFREMENT_CLE;
 if(!hex||!/^[a-f\d]{64}$/i.test(hex))throw new Error('Clé de conservation des courriels absente');
 return Buffer.from(hex,'hex');
}
export function chiffrerCourriel(id:string,p:ChargeCourriel) {
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',cle(),iv);c.setAAD(Buffer.from(id));
 const data=Buffer.concat([c.update(JSON.stringify(p),'utf8'),c.final()]);
 return [iv,c.getAuthTag(),data].map(b=>b.toString('base64')).join('.');
}
export function dechiffrerCourriel(id:string,s:string):ChargeCourriel {
 const [iv,tag,data]=s.split('.').map(v=>Buffer.from(v,'base64'));
 const c=createDecipheriv('aes-256-gcm',cle(),iv);c.setAAD(Buffer.from(id));c.setAuthTag(tag);
 return JSON.parse(Buffer.concat([c.update(data),c.final()]).toString('utf8'));
}
export function identiteCourriel(p:ChargeCourriel) {
 const contenu=JSON.stringify([p.subject,p.html,p.piecesJointes??[]]);
 const key=p.cleIdempotence??empreinteCourriel(contenu);
 const id=empreinteCourriel(JSON.stringify([p.organisationId??null,key,p.to.trim().toLowerCase()]));
 return {id,key,contenu};
}
export async function conserverCourriel(db:SupabaseClient,p:ChargeCourriel) {
 const {id,contenu}=identiteCourriel(p);
 // Les liens d’accès gardent 15 minutes. Une notification générique capturée dispose
 // de 12 heures, avec relecture obligatoire de sa source et des droits avant émission.
 const duree=p.contexteMetier?.type==='notification'&&p.contexteMetier.source?12*60*60_000:15*60_000;
 const r=await db.rpc('conserver_courriel',{p_id:id,p_org:p.organisationId??null,p_empreinte:empreinteCourriel(contenu),p_charge:chiffrerCourriel(id,p),p_expire:new Date(Date.now()+duree).toISOString()});
 if(r.error||r.data!==true)throw new Error('Conservation du courriel indisponible');
 if(p.contexteMetier){
  const contexte={...p.contexteMetier,destinataire:empreinteCourriel(p.to.trim().toLowerCase())};
  const a=await db.rpc('attacher_contexte_courriel',{p_id:id,p_org:p.organisationId??null,p_contexte:contexte});
  if(a.error||a.data!==true)throw new Error('Validation métier indisponible');
 }
}
export async function reprendreCourriels(db:SupabaseClient,envoyer:(p:ChargeCourriel,reference:string)=>Promise<ResultatCourriel>,avantEffet:()=>Promise<void>,budgetMs=10_000) {
 const debut=Date.now();let traites=0;
 const r=await db.rpc('courriels_a_reprendre');if(r.error)throw new Error('Reprises indisponibles');
 for(const m of r.data??[]) {
  if(Date.now()-debut>=budgetMs)break;
  await avantEffet();
  let p:ChargeCourriel;
  try {p=dechiffrerCourriel(m.id,m.charge_chiffree);}catch {throw new Error('Courriels conservés illisibles : vérifier la clé');}
  const identite=identiteCourriel(p);
  if(identite.id!==m.id)throw new Error('Identité incohérente');
  if(piloteLimite()&&p.canal!=='contact'&&!circuitAdmisPilote(p)){
   await suspendreCourrielPilote(db,p,'reprise-historique');
   continue;
  }
  await envoyerCourrielDurable(db,{cle:identite.key,destinataire:p.to,organisation:p.organisationId??null,contenu:identite.contenu},async reference=>{
   await avantEffet();
   if(Date.parse(m.expire_le)<=Date.now())return {erreur:'Message expiré'};
   if(p.organisationId){
    const org=await db.from('organizations').select('status').eq('id',p.organisationId).maybeSingle();
    if(org.error)return {erreur:'Organisation indisponible',recuperable:true};
    if(!['active','essai'].includes(org.data?.status))return {erreur:'Organisation inactive'};
   }
   // Seul le transfert contact possède une garde administrée dans son transport.
   // Les autres charges anciennes sans contexte ne sont jamais rejouées.
   if(p.canal!=='contact') {
    const refus=await verifierContexteCourriel(db,reference);
    if(refus)return refus;
   }
   return envoyer(p,reference);
  });
  traites++;
 }
 return {traites};
}
