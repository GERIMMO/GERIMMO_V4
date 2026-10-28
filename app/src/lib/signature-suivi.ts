import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CircuitBail } from "./signature-bail";
import { verifierAvantEffet } from "./controle-effets";
import { aujourdhuiParis } from "./dates";
import { lireDemandeZoho, rappelerDemandeZoho, retrouverBrouillonZoho, type ConfigurationZohoSign } from "./zoho-sign";

function verifierConnexion(c: CircuitBail, config: ConfigurationZohoSign) {
  if(c.prestataire!==config.prestataire || c.environnement!==config.environnement)throw new Error("La connexion ne correspond pas au circuit.");
}
async function verrouiller(db: SupabaseClient,id:string,jeton:string) {
  const v=await db.rpc("verrouiller_signature_bail",{p_circuit:id,p_jeton:jeton});
  if(v.error || !v.data)throw new Error("Ce circuit doit être vérifié à nouveau dans un instant.");
}
async function lire(db: SupabaseClient,id:string) {
  const r=await db.from("bail_signature_circuits").select("*").eq("id",id).single();
  if(r.error || !r.data)throw new Error("Circuit indisponible.");
  return r.data as CircuitBail;
}
async function liberer(db: SupabaseClient,id:string,jeton:string) {
  await db.from("bail_signature_circuits").update({verrou_jeton:null,verrou_jusqua:null}).eq("id",id).eq("verrou_jeton",jeton);
}
/** Uniquement un brouillon identique. Ce geste n'active ni ne recrée une demande. */
export async function rapprocherSignatureInterrompue(db:SupabaseClient,config:ConfigurationZohoSign,id:string) {
  const jeton=randomUUID();await verrouiller(db,id,jeton);
  try {
    const c=await lire(db,id);verifierConnexion(c,config);
    if(c.external_request_id || !["preparation","a_verifier"].includes(c.etat))return false;
    const trouve=await retrouverBrouillonZoho(config,c,AbortSignal.timeout(35_000),()=>verifierAvantEffet(db,"signatures"));
    await verifierAvantEffet(db,"signatures");
    const r=await db.rpc("rapprocher_brouillon_signature",{
      p_circuit:id,p_jeton:jeton,p_demande:trouve.demandeId,p_document:trouve.documentId,p_signataires:trouve.signataireIds,
    });
    if(r.error || !r.data)throw new Error("Le rapprochement doit être repris.");
    return true;
  } finally {await liberer(db,id,jeton);}
}

const jourParis = (date: Date) => aujourdhuiParis(date);
/** J+28 déclenche une alerte interne, jamais un troisième rappel au signataire. */
export function rangRelanceSignature(envoye:string|null|undefined,expire:string,maintenant=new Date()):7|21|null {
  if(!envoye || !Number.isFinite(Date.parse(envoye)) || !Number.isFinite(Date.parse(expire)) || Date.parse(expire)<=maintenant.getTime())return null;
  const age=(Date.parse(jourParis(maintenant))-Date.parse(jourParis(new Date(envoye))))/86_400_000;
  return age>=28?null:age>=21?21:age>=7?7:null;
}
export async function relancerSignature(db:SupabaseClient,config:ConfigurationZohoSign,id:string,env:Record<string,string|undefined>=process.env) {
  // Préparation locale : l'ouverture des rappels externes exige son interrupteur distinct.
  if(env.ZOHO_SIGN_RELANCES_ACTIVES!=="true")return false;
  const jeton=randomUUID();await verrouiller(db,id,jeton);
  try {
    const c=await lire(db,id);verifierConnexion(c,config);
    const rang=rangRelanceSignature(c.envoye_le,c.expire_le);
    if(c.etat!=="en_cours" || !c.external_request_id || rang===null)return false;
    await verifierAvantEffet(db,"signatures");
    const distant=await lireDemandeZoho(config,c.external_request_id);
    if(distant.id!==c.external_request_id || distant.external_id!==id)throw new Error("Référence de rappel incohérente.");
    if(distant.status!=="ongoing")return false;
    if(distant.signers.length!==c.signataires.length || new Set(distant.signers.map(s=>s.id)).size!==c.signataires.length ||
      c.signataires.some(s=>!distant.signers.some(d=>d.id===s.externalId && d.email.toLowerCase()===s.email.toLowerCase())) ||
      distant.signers.some(s=>!["signed","notified","initiated"].includes(s.status)) ||
      distant.signers.every(s=>s.status==="signed"))throw new Error("Les destinataires du rappel doivent être vérifiés.");
    await verifierAvantEffet(db,"signatures");
    const reservation=await db.rpc("reserver_relance_signature",{p_circuit:id,p_jour:rang,p_jeton:jeton});
    if(reservation.error)throw new Error("Le rappel ne peut pas être réservé.");
    if(!reservation.data)return false;
    await verifierAvantEffet(db,"signatures");
    // Après cette réservation, même une réponse perdue interdit tout second POST.
    await rappelerDemandeZoho(config,c.external_request_id,()=>verifierAvantEffet(db,"signatures"));
    const confirme=await db.from("signature_suivi_actions").update({etat:"confirme",confirme_le:new Date().toISOString()})
      .eq("circuit_id",id).eq("cle",`j${rang}`).eq("etat","incertain").select("cle").single();
    if(confirme.error || !confirme.data)throw new Error("La confirmation du rappel doit être vérifiée.");
    return true;
  } finally {await liberer(db,id,jeton);}
}
export async function alerterSignature(db:SupabaseClient,id:string) {
  const c=await lire(db,id);
  const motifs=["a_verifier","refuse","expire"].includes(c.etat)?[c.etat]:c.etat==="en_cours"?["j28","relance_incertaine"]:[];
  for(const motif of motifs) {
    const r=await db.rpc("alerter_suivi_signature",{p_circuit:id,p_motif:motif});
    if(r.error)throw new Error("L’alerte de suivi doit être reprise.");
  }
}
