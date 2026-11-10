import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {envoyerEmail} from './email';
import {identiteCourriel,type ChargeCourriel} from './reprise-courriels';
import {adresseDuSite} from './site';
import {verifierAvantEffet} from './controle-effets';
import type {ContexteCourriel} from './finalisation-courriels';
const TITRES:Record<string,string>={incident_urgent:'Incident urgent à examiner',mission_confiee:'Une mission vous est proposée',mission_acceptee:'Intervention acceptée',mission_refusee:'Intervention refusée',devis_demande:'Une demande de devis vous attend',devis_recu:'Un devis est disponible',reponse_gestionnaire:'Une réponse vous attend',piece_demandee:'Un document est demandé',signature_demandee:'Un document est à vérifier',rendez_vous_fixe:'Rendez-vous confirmé',creneaux_proposes:'Des créneaux sont à choisir'};
/** Capture SQL et transport existant : ce module n'a pas de second mécanisme d'émission. */
export async function traiterNotificationCapturee(db:SupabaseClient,id:string) {
 await verifierAvantEffet(db,'rappels');
 const jeton=randomUUID(),prise=await db.rpc('prendre_notification',{p_id:id,p_jeton:jeton});
 if(prise.error)throw new Error('Préparation des notifications indisponible');
 if(!prise.data)return {envoyee:false,motif:'en_attente' as const};
 const n=prise.data as {id:string;organisation:string;evenement:string;objet:string;role:string;destinataire:string;contexte:ContexteCourriel};
 let courrier:string|null=null;
 try {
  const origine=adresseDuSite();if(!origine)throw new Error('Origine absente');
  const chemin=n.role==='agence'?`/espace/${n.organisation}`:n.role==='artisan'?'/artisan':`/locataire/${n.organisation}`;
  const titre=TITRES[n.evenement];if(!titre)throw new Error('Circuit suspendu');
  // Un lien vers l'espace autorisé, sans détail confidentiel dans le courrier.
  const url=new URL(chemin,origine).href.replaceAll('&','&amp;').replaceAll('"','&quot;');
  const p:ChargeCourriel={to:n.destinataire,subject:titre,html:`<p>${titre}.</p><p>Consultez votre espace Gerimmo pour vérifier les informations et la prochaine action.</p><p><a href="${url}">Ouvrir mon espace</a></p>`,organisationId:n.organisation,cleIdempotence:`notification-source:${n.id}`,contexteMetier:n.contexte};
  const identite=identiteCourriel(p);
  const r=await envoyerEmail({...p,delaiMaxMs:2000,circuit:'notification-transactionnelle',organisation:{db,id:n.organisation},avantEnvoi:()=>verifierAvantEffet(db,'rappels')});
  const conserve=await db.from('courriels_durables').select('id,contexte_metier').eq('id',identite.id).maybeSingle();
  if(conserve.error)throw new Error('Suivi indisponible');
  if(conserve.data?.contexte_metier?.source===id)courrier=identite.id;
  return {envoyee:!r.erreur&&!!r.id,motif:r.erreur?'en_attente' as const:undefined};
 } finally {
  const fin=await db.rpc('finir_notification',{p_id:id,p_jeton:jeton,p_courriel:courrier});
  if(fin.error||fin.data!==true)throw new Error('Raccordement de notification à reprendre');
 }
}
export async function reprendreNotificationsCapturees(db:SupabaseClient,budgetMs=8000) {
 const debut=Date.now(),r=await db.rpc('notifications_a_preparer',{p_limite:25});
 if(r.error)throw new Error('Intentions de notification indisponibles');
 let traitees=0,erreurs=0;
 for(const n of r.data??[]) {if(Date.now()-debut>=budgetMs)break;try{await traiterNotificationCapturee(db,n.id);traitees++;}catch{erreurs++;}}
 return {traitees,erreurs};
}
