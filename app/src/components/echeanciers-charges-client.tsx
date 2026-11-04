"use client";
import {useActionStateProtegee} from '@/lib/use-action-state-protegee';
import {proposerEcheancierCharges,agirEcheancierCharges,type EtatEcheancierCharges} from '@/app/actions/echeanciers-charges';
import {premiereEcheanceCharges,resteEcheancierCharges,type EcheancierCharges} from '@/lib/echeanciers-charges';
import {eur,formaterDate} from '@/lib/ged';
import {BoutonEnvoi} from './ui/bouton-envoi';
import {ApercuDocumentEspace} from './apercu-document-espace';
import styles from './depenses-simplifiees.module.css';
export function ProposerPlanCharges({org,regularisation,annee,montant,aujourdhui,tardive}:{org:string;regularisation:string;annee:number;montant:number;aujourdhui:string;tardive:boolean}){
 const [etat,action,pending]=useActionStateProtegee(proposerEcheancierCharges.bind(null,org,regularisation),{} as EtatEcheancierCharges);
 return <details className={styles.avance}><summary>Charges {annee} · {eur(montant)} · proposer le paiement</summary><form action={action} data-saisie-confirmee className={styles.formulaire}>
  <div className={styles.champs}><label>Mensualités{tardive?<><input type="hidden" name="nombre" value="12"/><span>12 mensualités · décompte tardif</span></>:<input name="nombre" type="number" min="1" max="24" defaultValue="1" required/>}</label><label>Première échéance<input name="premiere" type="date" defaultValue={premiereEcheanceCharges(aujourdhui)} required/></label></div>
  <p className={styles.aide}>Le PDF sera disponible dans les deux espaces. Au moins un mois est laissé avant la première échéance. Le locataire doit accepter la proposition.</p>
  <label className={styles.aide}><input name="verifie" type="checkbox" required/> J’ai vérifié le décompte et confirme qu’aucun règlement de ce complément n’a déjà été reçu hors de cet échéancier.</label>
  <Message etat={etat}/><BoutonEnvoi enCours={pending} enCoursTexte="Préparation du PDF…">Créer le PDF et proposer l’échéancier</BoutonEnvoi>
 </form></details>;
}
export function PlanCharges({org,plan,proprietaire,aujourdhui,base}:{org:string;plan:EcheancierCharges;proprietaire:boolean;aujourdhui:string;base:string}){
 const [etat,action,pending]=useActionStateProtegee(agirEcheancierCharges.bind(null,org,plan.id,proprietaire),{} as EtatEcheancierCharges);
 const reste=resteEcheancierCharges(plan);
 return <article className={styles.plan}>
  <div className={styles.entete}><h4>{proprietaire?'Charges à suivre':'Votre échéancier de charges'}</h4><strong>{eur(reste/100)} restant{reste>100?'s':''}</strong></div>
  {!plan.publie_le?<p className={styles.aide}>Brouillon conservé. Reprenez la proposition pour produire son PDF.</p>:<>
   {plan.document_id&&<ApercuDocumentEspace fichier={`${base}/documents/${plan.document_id}/fichier`} titre="Décompte et échéancier de charges"/>}
   {!plan.accepte_le?(proprietaire?<p className={styles.message}>Proposition transmise · accord du locataire attendu.</p>:<form action={action} data-saisie-confirmee className={styles.accord}><input name="action" type="hidden" value="accepter"/><label><input type="checkbox" name="accord" required/> J’ai consulté le décompte et j’accepte les montants et dates de cet échéancier.</label><BoutonEnvoi enCours={pending}>Accepter l’échéancier</BoutonEnvoi></form>):<p className={styles.aide}>Échéancier accepté le {formaterDate(plan.accepte_le.slice(0,10))}.</p>}
   <ul className={styles.mensualites}>{plan.echeances.map(e=>{
    const solde=Math.max(0,Number(e.du_cents)-Number(e.recu_cents));
    return <li key={e.rang}><div><strong>{formaterDate(e.date)}</strong><span>{eur(e.du_cents/100)}{solde===0?' · Reçu':e.declare_le?' · Paiement signalé, réception à confirmer':e.date<=aujourdhui?' · À confirmer':''}</span></div>
     {solde>0&&plan.accepte_le&&(proprietaire?<details><summary>Confirmer la réception</summary><form action={action} data-saisie-confirmee className={styles.champs}><input name="action" type="hidden" value="confirmer"/><input name="rang" type="hidden" value={e.rang}/><label>Total reçu sur cette échéance<input name="montant" inputMode="decimal" defaultValue={(e.du_cents/100).toFixed(2)} required/></label><label>Date de réception<input name="date" type="date" max={aujourdhui} defaultValue={aujourdhui} required/></label><BoutonEnvoi enCours={pending}>Enregistrer la réception</BoutonEnvoi></form></details>:!e.declare_le&&<form action={action} data-saisie-confirmee><input name="action" type="hidden" value="declarer"/><input name="rang" type="hidden" value={e.rang}/><BoutonEnvoi variant="outline" enCours={pending}>Signaler mon paiement</BoutonEnvoi></form>)}
    </li>;
   })}</ul>
  </>}
  <Message etat={etat}/>
 </article>;
}
function Message({etat}:{etat:EtatEcheancierCharges}){return <>{etat.erreur&&<p role="alert" className={styles.erreur}>{etat.erreur}</p>}{etat.succes&&<p role="status" className={styles.message}>{etat.succes}</p>}</>}
