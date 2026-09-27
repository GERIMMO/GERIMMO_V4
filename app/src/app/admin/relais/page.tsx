import { createClient } from '@/lib/supabase/server';
import { formaterDateHeureParis, NOTE_FUSEAU } from '@/lib/heure-paris';
import { FormulaireDelegation, RevoquerDelegation } from '../autonomie/formulaire-delegation';
import { PlanContinuite } from '../equipes/continuite';

export const metadata={title:'Relais en mon absence — Gerimmo'};

// RELAIS EN MON ABSENCE (26/09) : sorti de « Dossiers et évolutions » pour
// rejoindre la rubrique Veille, à la demande du porteur. Même contenu, même
// ordre : le relais (accès de remplacement) d'abord, le plan de continuité
// (délai d'absence, consignes) ensuite, puis ce qui peut continuer seul.
export default async function PageRelais(){
 const db=await createClient();
 const [delegations,comptes,regles,presence,plan]=await Promise.all([
  db.from('supervision_delegations').select('id,account_id,termine_le,motif,active,revoquee_le').order('termine_le',{ascending:false}).limit(30),
  db.from('accounts').select('id,email'),
  db.from('continuity_rules').select('cle,libelle,decision,delai_heures,active'),
  db.from('supervision_presence').select('derniere_presence').order('derniere_presence',{ascending:false}).limit(1),
  db.rpc('etat_continuite'),
 ]);
 const emails=new Map((comptes.data??[]).map(c=>[c.id,c.email]));
 const maintenant=new Date();
 return <main className="mx-auto max-w-5xl space-y-6 p-4 sm:p-7">
  <div className="entete-page"><div className="min-w-0 flex-[1_1_20rem]"><h1>Relais en mon absence</h1><p className="mt-2 max-w-3xl text-sm text-[var(--texte-secondaire)]">Les envois et traitements déjà autorisés continuent. Les évolutions du logiciel attendent votre retour.</p></div></div>
  <section id="continuite" className="loc-carte scroll-mt-6"><div className="entete-carte"><h2>Qui prend le relais</h2></div><p className="mt-2 text-xs text-muted-foreground">{presence.error?'Dernière présence indisponible.':presence.data?.[0]?`Dernière présence de supervision : ${formaterDateHeureParis(presence.data[0].derniere_presence)}.`:'Aucune présence enregistrée.'} {NOTE_FUSEAU}</p>
  <div className="mt-4 grid gap-5 lg:grid-cols-2"><div><h3 className="mb-3 font-semibold">Préparer un relais</h3><FormulaireDelegation /></div><div><h3 className="mb-3 font-semibold">Accès de remplacement</h3>{delegations.error?<p role="alert" className="err">Les accès ne peuvent pas être vérifiés actuellement.</p>:delegations.data?.map(d=>{const actif=d.active&&!d.revoquee_le&&new Date(d.termine_le)>maintenant;return <div key={d.id} className="mb-3 rounded-xl border p-3"><b className="break-all text-sm">{emails.get(d.account_id)??'Compte de remplacement'}</b><p className="mt-1 text-xs text-muted-foreground">{actif?'Actif jusqu’au':'Terminé le'} {formaterDateHeureParis(d.termine_le)}</p><p className="my-2 text-sm">{d.motif}</p>{actif&&<RevoquerDelegation id={d.id}/>}</div>})}{!delegations.error&&!delegations.data?.length&&<p className="text-sm text-muted-foreground">Aucun relais désigné. Choisissez une personne de confiance avant une longue absence.</p>}<p className="mt-3 text-xs text-muted-foreground">Le remplaçant retrouve le suivi sur la page « Mes espaces » après connexion et double vérification.</p></div></div>
  <details className="mt-5 border-t pt-4"><summary className="cursor-pointer font-semibold">Délai d’absence et consignes</summary>{plan.error||!plan.data?<p className="err mt-3">Le plan de continuité est indisponible.</p>:<><p className="mt-3 text-sm">{!plan.data.derniere_presence?'Dernière présence inconnue.':plan.data.absence?'Le délai d’absence prévu est dépassé.':'Une présence de supervision a été enregistrée récemment.'} {plan.data.responsable_habilite?'Le responsable désigné possède déjà les droits nécessaires.':'Aucun responsable de remplacement habilité n’est confirmé.'}</p><PlanContinuite jours={plan.data.delai_jours} email={plan.data.responsable??''} consignes={plan.data.consignes??''}/></>}</details>
  <details className="mt-5 border-t pt-4"><summary className="cursor-pointer font-semibold">Ce qui peut continuer seul</summary>{regles.error?<p className="err">Règles indisponibles.</p>:<ul className="mt-3 space-y-2">{regles.data?.map(r=><li key={r.cle} className="rounded-lg bg-muted/40 p-3 text-sm"><b>{r.libelle}</b><span className="mt-1 block text-muted-foreground">{r.decision==='agir_seul'?'Traitement prévu dans les autorisations existantes':r.decision==='delegue_requis'?'Un responsable autorisé doit décider':'La décision attend votre retour'}. La règle ne crée pas un droit supplémentaire.</span></li>)}</ul>}</details></section>
 </main>;
}
