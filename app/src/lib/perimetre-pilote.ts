import type { SupabaseClient } from '@supabase/supabase-js';
import { empreinteCourriel, type ResultatCourriel } from './courriels-durables';
import { identiteCourriel, type ChargeCourriel } from './reprise-courriels';
/** Liste V1 fermée, indépendante des paiements. Une variable ne peut rouvrir un circuit non validé. */
export function piloteLimite():boolean {return true;}
export const MESSAGE_PILOTE='Envoi suspendu dans le pilote limité : intervention humaine requise. Aucun nouvel e-mail envoyé. La tâche reste à traiter.';
export function circuitAdmisPilote(p:ChargeCourriel):boolean {
 const c=p.contexteMetier;
 if(c?.type==='acces')return ['signup','recovery'].includes(c.usage)&&!!c.jeton_empreinte;
 if(c?.type==='invitation_artisan')return !!c.acteur;
 if(c?.type==='notification')return ['incident_urgent','mission_confiee','mission_refusee','mission_acceptee','devis_demande','devis_recu','reponse_gestionnaire','piece_demandee','signature_demandee','rendez_vous_fixe','creneaux_proposes'].includes(c.evenement);
 return !!c&&['quittance','bail_signe'].includes(c.type)&&((c.type==='quittance'&&c.automatique===true)||!!c.acteur);
}
export async function suspendreCourrielPilote(db:SupabaseClient,p:ChargeCourriel,circuit='non-classe'):Promise<ResultatCourriel> {
 const k=identiteCourriel(p);
 const r=await db.rpc('suspendre_courriel_pilote',{p_id:k.id,p_org:p.organisationId??null,p_empreinte:empreinteCourriel(k.contenu),p_circuit:circuit});
 if(r.error)return {erreur:'Envoi suspendu ; journal indisponible. Intervention humaine nécessaire.',interventionRequise:true};
 return {erreur:MESSAGE_PILOTE,interventionRequise:true,...(r.data?.etat==='inconnu'?{incertain:true as const}:{})};
}
