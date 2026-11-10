/** Frontière fournisseur simulée des anciens tests d'orchestration.
 * Ne teste PAS l'autorisation d'un circuit ni sa réservation durable.
 * Ces garanties sont testées avec le vrai envoyerEmail dans les suites V1.
 * Impossible d'utiliser ce double avec le fetch natif (aucun réseau réel).
 */
import type { envoyerEmailTransport } from '@/lib/email';
import { ArretSupervision } from '@/lib/controle-effets';
const fetchNatif=globalThis.fetch;
export async function transportEmailOrchestration(p:Parameters<typeof envoyerEmailTransport>[0]) {
 if(globalThis.fetch===fetchNatif&&!(globalThis.fetch as typeof fetch & {gerimmoFournisseurFictif?:boolean}).gerimmoFournisseurFictif)throw new Error('Fournisseur fictif obligatoire');
 await p.avantEnvoi?.();
 try {
  const r=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(p.delaiMaxMs??15000),headers:{'Content-Type':'application/json',...(p.cleIdempotence?{'Idempotency-Key':p.cleIdempotence}:{})},body:JSON.stringify({to:[p.to],subject:p.subject,html:p.html})});
  const corps=await r.json();
  return r.ok?{id:corps.id}:{erreur:corps.message??'Refus fournisseur fictif'};
 }catch(e){
  if(e instanceof ArretSupervision)throw e;
  return {erreur:e instanceof Error?e.message:'Réponse inconnue',incertain:true as const};
 }
}
