import {createClient} from '@/lib/supabase/server';
import {aujourdhuiParis} from '@/lib/ged';
import {lireToutesLesPages} from '@/lib/lecture-complete';
import {PlanCharges,ProposerPlanCharges} from './echeanciers-charges-client';
import {resteEcheancierCharges,type EcheancierCharges} from '@/lib/echeanciers-charges';
import styles from './depenses-simplifiees.module.css';
export async function SuiviEcheanciersCharges({org,bauxIds,proprietaire,base,rappelsSeulement=false}:{org:string;bauxIds?:string[];proprietaire:boolean;base:string;rappelsSeulement?:boolean}){
 if(bauxIds&&bauxIds.length===0)return null;
 const db=await createClient();const jour=aujourdhuiParis();
 if(proprietaire)await db.rpc('synchroniser_rappels_echeanciers_charges',{p_org:org});
 const plans=await lireToutesLesPages<EcheancierCharges>((debut,fin)=>{
  let q=db.from('echeanciers_charges').select('*',{count:'exact'}).eq('organization_id',org);
  if(bauxIds)q=q.in('bail_id',bauxIds);
  return q.order('created_at',{ascending:false}).order('id').range(debut,fin);
 },p=>p.id);
 if(plans.echec)return <p role="alert" className={styles.erreur}>Le suivi des échéanciers est indisponible. Les montants ne peuvent pas être confirmés.</p>;
 const visibles=plans.lignes.filter(p=>!rappelsSeulement||(resteEcheancierCharges(p)>0&&(proprietaire?!!p.accepte_le:p.publie_le)&&p.echeances.some(e=>e.date<=jour&&e.recu_cents<e.du_cents))||(!proprietaire&&p.publie_le&&!p.accepte_le));
 const connus=new Set(plans.lignes.filter(p=>p.document_id).map(p=>p.regularisation_id));
 const regularisations=proprietaire&&bauxIds?await lireToutesLesPages<{id:string;annee:number;ecart:number;tardive:boolean}>((debut,fin)=>db.from('regularisations_charges').select('id,annee,ecart,tardive',{count:'exact'}).eq('organization_id',org).in('bail_id',bauxIds).lt('ecart',0).order('id').range(debut,fin),r=>r.id):null;
 if(!visibles.length&&!regularisations?.echec&&!(regularisations?.lignes?.length))return null;
 return <section className={styles.suivi} aria-label={rappelsSeulement?'Rappels de charges':'Échéanciers de charges'}>
  <h3>{rappelsSeulement?(proprietaire?'Charges : avez-vous reçu les règlements ?':'Vos charges : paiements et propositions'):'Paiement des décomptes'}</h3>
  {regularisations?.echec&&<p role="alert" className={styles.erreur}>Les décomptes ne peuvent pas être vérifiés.</p>}
  {regularisations?.lignes?.filter(r=>!connus.has(r.id)).map(r=><ProposerPlanCharges key={r.id} org={org} regularisation={r.id} annee={r.annee} montant={-Number(r.ecart)} tardive={r.tardive} aujourdhui={jour}/>)}
  {visibles.map(p=><PlanCharges key={p.id} org={org} plan={p} proprietaire={proprietaire} aujourdhui={jour} base={base}/>)}
 </section>;
}
