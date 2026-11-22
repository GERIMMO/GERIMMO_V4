import { estDocumentPdfComplet } from "./file-type";
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
 if(c?.type==='confirmation_abonnement') {
  const piece=p.piecesJointes?.[0];
  return !paiementsInterdits() && !!p.organisationId && !!c.id && !!c.version && !!c.acceptee &&
   Number.isSafeInteger(c.montant) && c.montant>=0 && c.document===true &&
   p.piecesJointes?.length===1 && !!piece && piece.nom===`conditions-generales-${c.version}.pdf` &&
   typeof piece.contenuBase64==="string" && estDocumentPdfComplet(Buffer.from(piece.contenuBase64,"base64"));
 }
 if(c?.type==='accuse_resiliation') return !paiementsInterdits() && !!p.organisationId && !!c.id && !!c.fin && !p.piecesJointes?.length;
 if(c?.type==='reconduction')return !!p.organisationId && Number.isSafeInteger(c.montant) && c.montant>=0 && !p.piecesJointes?.length;
 if(c?.type==='acces')return ['signup','recovery'].includes(c.usage)&&!!c.jeton_empreinte;
 if(c?.type==='invitation_artisan')return !!c.acteur;
 // Audit palier 1 du 22/11/2026 (P1-01) : le lien de confirmation du mobile envoyé au garant. Sans lui, la signature
 // électronique d'un bail avec garant était bloquée. La base refait la preuve avant l'envoi (lien toujours ouvert,
 // même garant, même circuit, même adresse : migration 20261122130000).
 if(c?.type==='confirmation_mobile_garant') {
  const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  return !!p.organisationId && uuid.test(c.id) && uuid.test(c.acteur??'') && !!c.garant && /^[0-9a-f]{64}$/.test(c.jeton_empreinte) && !p.piecesJointes?.length;
 }
 // Audit palier 1 du 22/11/2026 (P1-08) : les quatre envois automatiques prévus et suspendus. Ils sont admis ICI par
 // leur seule forme ; c'est la base qui décide, juste avant chaque envoi et à chaque reprise : l'interrupteur du
 // superviseur est ouvert pour ce flux (fermé par défaut), aucun arrêt d'urgence, et l'e-mail est redit dû à cette
 // adresse (migration 20261122200000). Les tâches ne joignent ce contexte que si l'interrupteur est ouvert : fermé,
 // elles restent suspendues exactement comme avant (lib/envois-suspendus.ts).
 if(c?.type==='avis_echeance'||c?.type==='relance_loyer'||c?.type==='rappel_rendez_vous'||c?.type==='relance_invitation') {
  const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i, montant=/^\d{1,9}(\.\d{1,2})?$/;
  if(!uuid.test(c.id) || p.piecesJointes?.length) return false;
  if(c.type==='avis_echeance') return !!p.organisationId;
  if(c.type==='relance_loyer') return !!p.organisationId && ['relance_1','relance_2'].includes(c.niveau) && ['locataire','caution'].includes(c.cible)
   && /^\d{4}-\d{2}-\d{2}$/.test(c.echeance) && montant.test(c.reste) && (c.total===null || montant.test(c.total));
  if(c.type==='rappel_rendez_vous') return !!p.organisationId && ['veille','j7'].includes(c.echeance) && ['locataire','artisan'].includes(c.role);
  return ['1','2'].includes(c.rang);
 }
 // Audit palier 1 du 22/11/2026 (P1-16) : les motifs d'un refus ou d'une suspension, que les conditions de l'espace
 // artisan promettent par courriel. Admis ICI par sa seule forme (une décision, aucun espace, aucune pièce) ; c'est
 // la base qui décide, juste avant l'envoi : décision la plus récente de cet artisan, motivée, pas encore notifiée,
 // adresse de sa fiche (migration 20261122210000).
 if(c?.type==='decision_artisan') return !p.organisationId && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(c.id) && !p.piecesJointes?.length;
 if(c?.type==='notification')return ['incident_urgent','mission_confiee','mission_refusee','mission_acceptee','devis_demande','reponse_gestionnaire','piece_demandee','signature_demandee','rendez_vous_fixe','creneaux_proposes'].includes(c.evenement);
 return !!c&&['quittance','bail_signe'].includes(c.type)&&((c.type==='quittance'&&c.automatique===true)||!!c.acteur);
}
export async function suspendreCourrielPilote(db:SupabaseClient,p:ChargeCourriel,circuit='non-classe'):Promise<ResultatCourriel> {
 const k=identiteCourriel(p);
 const r=await db.rpc('suspendre_courriel_pilote',{p_id:k.id,p_org:p.organisationId??null,p_empreinte:empreinteCourriel(k.contenu),p_circuit:circuit});
 if(r.error)return {erreur:'Envoi suspendu ; journal indisponible. Intervention humaine nécessaire.',interventionRequise:true};
 return {erreur:MESSAGE_PILOTE,interventionRequise:true,...(r.data?.etat==='inconnu'?{incertain:true as const}:{})};
}
