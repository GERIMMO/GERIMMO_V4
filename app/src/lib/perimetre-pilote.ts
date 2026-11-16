import { incidentContractuel } from "./contrat-incidents-contexte";
import { lireAdressesRelais } from './relais-alerte';
import { paiementsInterdits } from './verrou-pilote';
import type { SupabaseClient } from '@supabase/supabase-js';
import { empreinteCourriel, type ResultatCourriel } from './courriels-durables';
import { identiteCourriel, type ChargeCourriel } from './reprise-courriels';
/** Liste V1 fermée, indépendante des paiements. Une variable ne peut rouvrir un circuit non validé. */
export function piloteLimite():boolean {return true;}
export const MESSAGE_PILOTE='Envoi suspendu dans le périmètre validé : intervention humaine requise. Aucun nouvel e-mail envoyé. La tâche reste à traiter.';
export function circuitAdmisPilote(p:ChargeCourriel):boolean {
 const c=p.contexteMetier;
 if(c?.type==="fin_essai_choisi") return !paiementsInterdits() && !!p.organisationId && !!c.id && !!c.client && Number.isSafeInteger(c.montant) && c.montant>0 && !p.piecesJointes?.length;
 if(c?.type==="avertissement_inactivite") return !p.organisationId && ["j60","j15"].includes(c.etape) && !!c.id && !!c.activite && !p.piecesJointes?.length;
 if(c?.type==='alerte_direction') {
  if(p.organisationId || p.piecesJointes?.length || !p.to.trim()) return false;
  const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  if(c.categorie==='veto') return uuid.test(c.id) && !!c.parution && /^[a-f0-9]{64}$/.test(c.apercu);
  if(!lireAdressesRelais(process.env.GERIMMO_RELAIS_EMAILS).valides.some(a=>a.toLowerCase()===p.to.trim().toLowerCase())) return false;
  if(c.categorie==='quotidienne') return /^\d{4}-\d{2}-\d{2}$/.test(c.id);
  if(c.categorie==='urgence') return uuid.test(c.id);
  return c.categorie==='contrat' && /^[a-f0-9]{64}$/.test(c.id);
 }
 if(c?.type==='notification' && c.evenement==='devis_recu') return !!p.organisationId && !!c.source && c.role==='agence' && !p.piecesJointes?.length;
 if(c?.type==='notification' && ['rdv_report_demande','rdv_report_accepte'].includes(c.evenement))
  return !!p.organisationId && !!c.source && !p.piecesJointes?.length && c.role===(c.evenement==='rdv_report_demande'?'artisan':'locataire');
 if(incidentContractuel(c?.type)) return !paiementsInterdits() && !!p.organisationId && !!c?.id && !p.piecesJointes?.length;
 if(c?.type==='confirmation_abonnement'||c?.type==='accuse_resiliation') {
  return !paiementsInterdits() && !!p.organisationId && !!c.id &&
    (c.type==='confirmation_abonnement' ? !!c.version && !!c.acceptee && Number.isSafeInteger(c.montant) && c.montant>=0 : !!c.fin && !p.piecesJointes?.length);
 }
 if(c?.type==='reconduction')return !!p.organisationId && Number.isSafeInteger(c.montant) && c.montant>=0 && !p.piecesJointes?.length;
 if(c?.type==='acces')return ['signup','recovery'].includes(c.usage)&&!!c.jeton_empreinte;
 if(c?.type==='invitation_artisan')return !!c.acteur;
 if(c?.type==='notification')return ['incident_urgent','mission_confiee','mission_refusee','mission_acceptee','devis_demande','reponse_gestionnaire','piece_demandee','signature_demandee','rendez_vous_fixe','creneaux_proposes'].includes(c.evenement);
 return !!c&&['quittance','bail_signe'].includes(c.type)&&((c.type==='quittance'&&c.automatique===true)||!!c.acteur);
}
export async function suspendreCourrielPilote(db:SupabaseClient,p:ChargeCourriel,circuit='non-classe'):Promise<ResultatCourriel> {
 const k=identiteCourriel(p);
 const r=await db.rpc('suspendre_courriel_pilote',{p_id:k.id,p_org:p.organisationId??null,p_empreinte:empreinteCourriel(k.contenu),p_circuit:circuit});
 if(r.error)return {erreur:'Envoi suspendu ; journal indisponible. Intervention humaine nécessaire.',interventionRequise:true};
 return {erreur:MESSAGE_PILOTE,interventionRequise:true,...(r.data?.etat==='inconnu'?{incertain:true as const}:{})};
}
