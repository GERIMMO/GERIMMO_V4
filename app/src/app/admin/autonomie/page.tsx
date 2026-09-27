import Link from 'next/link';
import {SuiviCorrection} from './suivi-correction';
import { createClient } from '@/lib/supabase/server';
import { formaterDateHeureParis, formaterDateParis } from '@/lib/heure-paris';
import { ETATS_DEVELOPPEMENT, ETATS_DOSSIER, TYPES_DOSSIER, lienDossier } from '@/lib/pilotage';
import { ActualiserDossiers, DecisionAmelioration } from './formulaire-delegation';
export const metadata={title:'Développement du site — Gerimmo'};
// La carte commune de la console (nuit du 25/09).
const carte='loc-carte';
const filtres:Record<string,string>={tous:'Tous les dossiers',bail:'Locations',loyer:'Loyers en retard',incident:'Incidents',intervention:'Interventions',document:'Documents',rapport:'Finance et rapports'};
const risques:Record<string,string>={faible:'Impact limité',moyen:'À examiner',eleve:'Impact important',critique:'Priorité critique'};
export default async function PageAutonomie({searchParams}:{searchParams:Promise<{equipe?:string;page?:string}>}) {
 const p=await searchParams;const equipe=p.equipe&&Object.hasOwn(filtres,p.equipe)?p.equipe:'tous';
 const page=Math.max(1,Math.min(10000,Number.parseInt(p.page??'1',10)||1));
 const db=await createClient();
 let q=db.from('orchestration_cases').select('id,organization_id,dossier_type,dossier_id,prochaine_action,mode,etat,priorite,exception_message,updated_at,lien_action,agir_apres',{count:'exact'}).neq('etat','termine').order('rang_priorite').order('updated_at').order('id').range((page-1)*25,page*25-1);
 if(equipe!=='tous')q=q.eq('dossier_type',equipe);
 const [dossiers,propositions,orgs]=await Promise.all([
  q,db.from('development_proposals').select('id,titre,probleme,solution_proposee,risque,statut,revision,updated_at,rapport_controles,autorisee_le').order('updated_at',{ascending:false}).limit(30),
  db.from('organizations').select('id,name'),
 ]);
 const ids=(dossiers.data??[]).map(d=>d.id);
 const historique=ids.length?await db.from('orchestration_history').select('id,case_id,action,etat,created_at').in('case_id',ids).order('created_at',{ascending:false}).limit(200):{data:[],error:null};
 const noms=new Map((orgs.data??[]).map(o=>[o.id,o.name]));
 // Filtres et pagination seulement quand il y a quelque chose à filtrer (audit
 // 25/09, C28) : sept puces et « 0 dossiers · page 1 » sur une liste vide.
 const total=dossiers.count??0;const vide=!dossiers.error&&total===0;const filtreActif=equipe!=='tous';
 return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-7">
  {/* L'en-tête commun de la console (24/09) : le titre reprend le nom de
      l'entrée de barre. L'actualisation, geste principal, est ici. */}
  <div className="entete-page"><div className="min-w-0 flex-[1_1_20rem]"><h1>Développement du site</h1><p className="mt-2 max-w-3xl text-sm text-[var(--texte-secondaire)]">La prochaine étape de chaque dossier et les améliorations du logiciel qui attendent votre accord.</p></div><div className="flex flex-wrap items-center gap-3"><span className="mono-discret">Actualisé chaque matin</span><ActualiserDossiers /></div></div>
  <section id="dossiers" className={carte}><div className="entete-carte"><h2 className="text-xl font-semibold">Les prochaines étapes</h2><span className="mono-discret">{dossiers.error?'indisponible':`${total} dossier${total>1?'s':''}`}</span></div><p className="mt-1 text-sm text-muted-foreground">Les envois autorisés continuent selon les réglages de chaque organisation.</p>
  {!vide||filtreActif?<nav aria-label="Filtrer par équipe" className="my-4 flex flex-wrap gap-2">{Object.entries(filtres).map(([k,v])=><Link key={k} href={k==='tous'?'/admin/autonomie':`/admin/autonomie?equipe=${k}`} scroll={false} aria-current={equipe===k?'true':undefined} className={`filtre${equipe===k?' actif':''}`}>{v}</Link>)}</nav>:null}
  {/* Toute la carte est le lien (24/09). */}
  {dossiers.error?<p role="alert" className="err mt-4">Le suivi des dossiers est indisponible. Actualisez avant de prendre une décision.</p>:vide?<div className="vide-guide mt-4"><p className="titre">{filtreActif?'Aucun dossier pour ce filtre':'Aucun dossier en attente d’une étape'}</p><p className="explication">{filtreActif?'Élargissez le filtre ou revenez à tous les dossiers.':'Les dossiers apparaissent ici dès qu’une location, un incident, une signature ou un compte rendu attend une étape. « Actualiser les prochaines étapes » vérifie les dossiers existants.'}</p>{filtreActif&&<div className="geste"><Link href="/admin/autonomie" className="btn-secondaire">Tous les dossiers</Link></div>}</div>:<div className="mt-4 space-y-3">{dossiers.data?.map(d=><Link key={d.id} href={lienDossier(d)} className={`group block rounded-xl border p-4 transition-colors hover:border-[var(--marque)] ${d.priorite==='urgente'?'border-[var(--warning)] bg-[var(--warning-soft)]':'border-[var(--filet)] bg-[var(--ivoire)] hover:bg-[var(--survol)]'}`}><div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-muted-foreground">{noms.get(d.organization_id)??'Organisation'} · {TYPES_DOSSIER[d.dossier_type]??'Dossier'}</p><h3 className="mt-1 font-semibold">{d.prochaine_action}</h3></div><span className="puce puce-prep">{ETATS_DOSSIER[d.etat]??'À vérifier'}</span></div>{d.agir_apres&&<p className="mt-2 text-xs text-muted-foreground">Échéance enregistrée : {formaterDateParis(d.agir_apres)}</p>}{d.exception_message&&<p className="mt-2 text-sm text-amber-900">{d.exception_message}</p>}<span className="mt-3 flex justify-end"><span className="lien-discret text-[12.5px] group-hover:underline">Ouvrir le dossier →</span></span></Link>)}</div>}
  {!vide&&<details className="mt-4 border-t pt-3"><summary className="cursor-pointer font-medium">Dernières étapes des dossiers affichés</summary>{historique.error?<p role="alert" className="err">L’historique est momentanément indisponible.</p>:<ol className="mt-3 space-y-2">{historique.data?.slice(0,30).map(h=><li key={h.id} className="rounded-lg bg-muted/30 p-3 text-sm"><span className="text-xs text-muted-foreground">{formaterDateHeureParis(h.created_at)}</span><p>{h.action}</p></li>)}{!historique.data?.length&&<li>Aucun changement enregistré depuis la mise en place de cet historique.</li>}</ol>}</details>}
  {total>25&&<nav aria-label="Pages de dossiers" className="mt-4 flex justify-between text-sm">{page>1?<Link href={`?equipe=${equipe}&page=${page-1}`}>Précédente</Link>:<span/>}<span>{total} dossiers · page {page}</span>{page*25<total&&<Link href={`?equipe=${equipe}&page=${page+1}`}>Suivante</Link>}</nav>}</section>
  <section id="ameliorations" className={carte}><h2 className="text-xl font-semibold">Équipe Qualité et corrections</h2><p className="mt-2 text-sm text-muted-foreground">Les problèmes et idées transmis par les utilisateurs alimentent cette file. Chaque changement suit une préparation, des contrôles, une démonstration et une publication. L’accord porte sur une version précise et devient caduc si elle change.</p>
  {propositions.error?<p role="alert" className="err mt-3">Les améliorations sont momentanément indisponibles.</p>:<div className="mt-4 grid gap-3 md:grid-cols-2">{propositions.data?.map(a=><article key={a.id} className="rounded-xl border bg-muted/30 p-4"><div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{a.titre}</h3><span className="puce puce-prep">{ETATS_DEVELOPPEMENT[a.statut]??'À examiner'}</span></div><p className="mt-2 text-xs text-muted-foreground">{risques[a.risque]??'Impact à vérifier'}</p><p className="mt-2 text-sm">{a.solution_proposee||a.probleme}</p><SuiviCorrection id={a.id} rapport={a.rapport_controles} statut={a.statut} autoriseeLe={a.autorisee_le} demande={[a.probleme,a.solution_proposee].filter(Boolean).join('\n\n')}/>{a.statut==='autorisation'&&a.revision&&<div className="mt-3"><DecisionAmelioration id={a.id} revision={a.revision}/></div>}</article>)}{!propositions.data?.length&&<p className="text-sm text-muted-foreground">Aucune proposition en attente.</p>}</div>}<Link href="/admin/retours" className="lien-discret mt-4 inline-block text-[12.5px]">Voir les retours →</Link></section>
 </main>;
}
