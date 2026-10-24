import { ConsoleSection } from "@/components/console-section";
import { lirePage, numeroPage, rechercheIlike } from "@/lib/pagination-supervision";
import { Pagination } from "../pagination";
import { FolderOpen, AlertTriangle, LockKeyhole, CalendarClock, ArrowUpRight, History, ChevronDown, Info, CheckCheck, Building2, Wrench, FileText, Wallet } from "lucide-react";
import styles from "../repertoires.module.css";
import { TitreEcran } from "@/components/titre-ecran";
import Link from 'next/link';
import {SuiviCorrection} from './suivi-correction';
import { createClient } from '@/lib/supabase/server';
import { formaterDateHeureParis, formaterDateParis } from '@/lib/heure-paris';
import { ETATS_DEVELOPPEMENT, ETATS_DOSSIER, TYPES_DOSSIER, lienDossier } from '@/lib/pilotage';
import { ActualiserDossiers, DecisionAmelioration } from './formulaire-delegation';
import { cheminPourProfil } from '@/lib/racine-espace';
export async function generateMetadata({searchParams}:{searchParams:Promise<{vue?:string}>}){const p=await searchParams;return {title:p.vue==='ameliorations'?'Améliorations du produit':'Activité et dossiers'};}
// La carte commune de la console (nuit du 25/09).
const carte='loc-carte';
const filtres:Record<string,string>={tous:'Tous les dossiers',bail:'Locations',loyer:'Loyers en retard',incident:'Incidents',intervention:'Interventions',document:'Documents',rapport:'Finance et rapports'};
const risques:Record<string,string>={faible:'Impact limité',moyen:'À examiner',eleve:'Impact important',critique:'Priorité critique'};
export default async function PageAutonomie({searchParams}:{searchParams:Promise<{equipe?:string;page?:string;pageAmeliorations?:string;vue?:string;statutProduit?:string;rechercheProduit?:string}>}) {
 const p=await searchParams;const vue=p.vue==='ameliorations'?'ameliorations':p.vue==='dossiers'?'dossiers':null;
 const adresseDossiers=(e='tous',n=1)=>`/admin/autonomie?${new URLSearchParams({...(vue?{vue}:{}),...(e!=='tous'?{equipe:e}:{}),...(n>1?{page:String(n)}:{})})}`;
 const equipe=p.equipe&&Object.hasOwn(filtres,p.equipe)?p.equipe:'tous';
 const page=Math.max(1,Math.min(10000,Number.parseInt(p.page??'1',10)||1));
 const db=await createClient();
 const statutProduit=p.statutProduit&&Object.hasOwn(ETATS_DEVELOPPEMENT,p.statutProduit)?p.statutProduit:'';
 const rechercheProduit=(p.rechercheProduit??'').trim().slice(0,160);
 let q=db.from('orchestration_cases').select('id,organization_id,dossier_type,dossier_id,prochaine_action,mode,etat,priorite,exception_message,updated_at,lien_action,agir_apres',{count:'exact'}).neq('etat','termine').order('rang_priorite').order('updated_at').order('id').range((page-1)*25,page*25-1);
 if(equipe!=='tous')q=q.eq('dossier_type',equipe);
 const [dossiers,propositions]=await Promise.all([
  q,lirePage((a,b)=>{let q=db.from('development_proposals').select('id,titre,probleme,solution_proposee,risque,statut,revision,updated_at,rapport_controles,autorisee_le,publiee_le,preuve_publication',{count:'exact'});if(statutProduit)q=q.eq('statut',statutProduit);if(rechercheProduit)q=q.or(`titre.ilike.${rechercheIlike(rechercheProduit)},probleme.ilike.${rechercheIlike(rechercheProduit)}`);return q.order('updated_at',{ascending:false}).order('id').range(a,b);},numeroPage(p.pageAmeliorations)),
 ]);
 const idsOrganisations=[...new Set((dossiers.data??[]).map(d=>d.organization_id))];
 const orgs=idsOrganisations.length?await db.from('organizations').select('id,name,type').in('id',idsOrganisations):{data:[],error:null};
 const adresseAmeliorations=(n:number)=>`/admin/autonomie?${new URLSearchParams({...(vue?{vue}:{}),...(equipe!=='tous'?{equipe}:{}),...(page>1?{page:String(page)}:{}),statutProduit,rechercheProduit,pageAmeliorations:String(n)})}#ameliorations`;
 const ids=(dossiers.data??[]).map(d=>d.id);
 const historique=ids.length?await db.from('orchestration_history').select('id,case_id,action,etat,created_at').in('case_id',ids).order('created_at',{ascending:false}).limit(200):{data:[],error:null};
 const noms=new Map((orgs.data??[]).map(o=>[o.id,o.name]));
 // Décision D27 : le dossier d'un propriétaire direct s'ouvre sous /espace/<id> (les liens enregistrés portent /agence/<id>).
 const proprietairesDirects=new Set((orgs.data??[]).filter(o=>o.type==='proprietaire_direct').map(o=>o.id));
 // Filtres et pagination seulement quand il y a quelque chose à filtrer (audit
 // 25/09, C28) : sept puces et « 0 dossiers · page 1 » sur une liste vide.
 const total=dossiers.count??0;const vide=!dossiers.error&&total===0;const filtreActif=equipe!=='tous';
 const affiches=dossiers.data??[];const urgents=affiches.filter(d=>d.priorite==='urgente').length;const bloques=affiches.filter(d=>d.etat==='bloque').length;
 const icones:Record<string,typeof FolderOpen>={bail:Building2,loyer:Wallet,incident:AlertTriangle,intervention:Wrench,document:FileText,rapport:FileText};
 return <main className={styles.page}>
  <header className={styles.header}><div><p className={styles.eyebrow}>{vue==='ameliorations'?'ÉVOLUTION DE GERIMMO':'SUIVI OPÉRATIONNEL'}</p><TitreEcran rubrique="suivi">{vue==='ameliorations'?'Améliorations du produit':'Activité et dossiers'}</TitreEcran><p className={styles.subtitle}>{vue==='ameliorations'?'Les corrections proposées, leurs contrôles et les versions qui attendent votre accord.':'Identifiez les dossiers prioritaires et retrouvez la prochaine action à réaliser.'}</p></div>{vue!=='ameliorations'&&<ActualiserDossiers />}</header>
  {vue!=='ameliorations'&&<>
  <div className={styles.stats} data-columns="3" aria-label="Résumé des dossiers">
    <div className={styles.stat}><span className={styles.statIcon}><FolderOpen size={20} aria-hidden="true" /></span><strong>{dossiers.error?'—':total}</strong><span>Dossiers en cours</span><small>{filtreActif?filtres[equipe]:'Toutes les catégories'}</small></div>
    <div className={styles.stat} data-tone="ambre"><span className={styles.statIcon}><AlertTriangle size={20} aria-hidden="true" /></span><strong>{dossiers.error?'—':urgents}</strong><span>Priorités urgentes</span><small>Parmi les dossiers affichés</small></div>
    <div className={styles.stat} data-tone="rouge"><span className={styles.statIcon}><LockKeyhole size={20} aria-hidden="true" /></span><strong>{dossiers.error?'—':bloques}</strong><span>Dossiers à débloquer</span><small>Parmi les dossiers affichés</small></div>
  </div>
  {orgs.error&&<p role="alert" className="err mb-4">Les noms des organisations sont momentanément indisponibles.</p>}
  <section id="dossiers" className={styles.directory} aria-labelledby="dossiers-titre">
    <div className={styles.directoryHeading}><div><h2 id="dossiers-titre">Les prochaines actions</h2><p>{dossiers.error?'Lecture du suivi indisponible.':'Cette liste indique la prochaine action ; elle ne la lance pas, l’étape se fait dans le dossier concerné. Les dossiers urgents apparaissent en premier.'}</p></div><span className={styles.badge} data-tone="bleu">{dossiers.error?'À vérifier':`${affiches.length} affiché${affiches.length>1?'s':''}`}</span></div>
    {(!vide||filtreActif)&&<nav aria-label="Filtrer les dossiers par catégorie" className={styles.filters}>{Object.entries(filtres).map(([k,v])=><Link key={k} href={adresseDossiers(k)} scroll={false} aria-current={equipe===k?'true':undefined}>{v}</Link>)}</nav>}
    {dossiers.error?<p role="alert" className="err px-6 pb-6">Le suivi des dossiers est indisponible. Actualisez avant de prendre une décision.</p>:affiches.length===0?<div className={styles.empty}><CheckCheck size={28} aria-hidden="true" /><h3>{page>1?'Aucun dossier sur cette page':filtreActif?'Aucun dossier dans cette catégorie':'Aucune prochaine action enregistrée'}</h3><p>{page>1?'La liste a peut-être changé depuis votre dernière visite.':filtreActif?'Les autres catégories restent accessibles dans les filtres.':'Les locations, incidents et documents apparaissent ici lorsqu’une étape est attendue. Actualisez pour vérifier les dossiers existants.'}</p>{(filtreActif||page>1)&&<Link href={adresseDossiers(page>1?equipe:'tous')}>Revenir à {page>1?'la première page':'tous les dossiers'} <ArrowUpRight size={15} aria-hidden="true" /></Link>}</div>:<div className={styles.caseList}>
      {affiches.map(d=>{const Icone=icones[d.dossier_type]??FolderOpen;return <Link key={d.id} href={cheminPourProfil(lienDossier(d),proprietairesDirects.has(d.organization_id))} className={styles.case} data-urgent={d.priorite==='urgente'}>
        <div className={styles.caseHead}><span className={styles.avatar}><Icone size={20} aria-hidden="true" /></span><div className={styles.caseIdentity}><p>{noms.get(d.organization_id)??'Organisation'} · {TYPES_DOSSIER[d.dossier_type]??'Dossier'}</p><h3>{d.prochaine_action}</h3></div><div className={styles.caseStates}>{d.priorite==='urgente'&&<span className={styles.badge} data-tone="ambre">Urgent</span>}<span className={styles.badge} data-tone={d.etat==='bloque'?'rouge':d.etat==='en_cours'?'bleu':'gris'}>{ETATS_DOSSIER[d.etat]??'À vérifier'}</span></div></div>
        {d.exception_message&&<p className={styles.exception}>{d.exception_message}</p>}
        <div className={styles.caseFooter}>{d.agir_apres&&<span><CalendarClock size={13} aria-hidden="true" />Échéance : {formaterDateParis(d.agir_apres)}</span>}<span>Ouvrir le dossier <ArrowUpRight size={15} aria-hidden="true" /></span></div>
      </Link>;})}
    </div>}
    {(total>25||page>1)&&<nav aria-label="Pages de dossiers" className={styles.pagination}>{page>1?<Link href={adresseDossiers(equipe,page-1)}>← Précédente</Link>:<span/>}<span>{total} dossiers · page {page}</span>{page*25<total?<Link href={adresseDossiers(equipe,page+1)}>Suivante →</Link>:<span/>}</nav>}
  </section>
  <p className={styles.context}><Info size={15} aria-hidden="true" /><span>Ce suivi n’exécute pas les actions à votre place. Ouvrez le dossier pour agir ; les tâches automatiques autorisées continuent selon les réglages de chaque organisation.</span></p>
  {!vide&&!dossiers.error&&<details className={styles.history}><summary><History size={17} aria-hidden="true" />Dernières étapes des dossiers affichés<ChevronDown size={16} aria-hidden="true" /></summary>{historique.error?<p role="alert" className="err px-6 pb-5">L’historique est momentanément indisponible.</p>:<ol className={styles.timeline}>{historique.data?.slice(0,30).map(h=><li key={h.id}><time dateTime={h.created_at}>{formaterDateHeureParis(h.created_at)}</time><p>{h.action}</p></li>)}{!historique.data?.length&&<li>Aucun changement enregistré depuis la mise en place de cet historique.</li>}</ol>}</details>}
  </>}
  {vue!=='dossiers'&&<section id="ameliorations" className={carte}><h2 className="text-xl font-semibold">Corrections et idées</h2><p className="mt-2 text-sm text-muted-foreground">Ouvrez une proposition pour voir ses contrôles et décider.</p>
  <form method="get" className={`${styles.filterForm} mt-4`}><input type="hidden" name="vue" value="ameliorations"/><label>État<select name="statutProduit" className="champ block" defaultValue={statutProduit}><option value="">Tous les états</option>{Object.entries(ETATS_DEVELOPPEMENT).map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label><label>Rechercher<input name="rechercheProduit" className="champ block" defaultValue={rechercheProduit}/></label><button className="btn-secondaire">Filtrer</button></form>
  {!propositions.error&&<p className="mt-3 text-sm text-muted-foreground">{propositions.data?.length??0} propositions affichées sur {propositions.count??"—"} · {statutProduit?ETATS_DEVELOPPEMENT[statutProduit]:'Tous les états'}</p>}
  {propositions.error?<p role="alert" className="err mt-3">Les améliorations sont momentanément indisponibles.</p>:<div className="mt-4">{propositions.data?.map(a=><ConsoleSection id={a.id} key={a.id} titre={a.titre} description={risques[a.risque]??"Impact à vérifier"} statut={ETATS_DEVELOPPEMENT[a.statut]??"À examiner"} ton={a.statut==="autorisation"?"ambre":"violet"} icone="documents"><p className="mt-2 text-sm">{a.solution_proposee||a.probleme}</p><SuiviCorrection id={a.id} rapport={a.rapport_controles} statut={a.statut} autoriseeLe={a.autorisee_le} publieeLe={a.publiee_le} preuvePublication={a.preuve_publication} revision={a.revision} demande={[a.probleme,a.solution_proposee].filter(Boolean).join('\n\n')}/>{a.statut==='autorisation'&&a.revision&&<div className="mt-3"><DecisionAmelioration id={a.id} revision={a.revision}/></div>}</ConsoleSection>)}{!propositions.data?.length&&<p className="text-sm text-muted-foreground">{statutProduit || rechercheProduit ? "Aucune proposition pour ces filtres." : "Aucune proposition enregistrée."} {(statutProduit || rechercheProduit) && <Link className="lien-discret" href="/admin/autonomie?vue=ameliorations">Effacer les filtres</Link>}</p>}</div>}{!propositions.error&&propositions.count!==null&&<Pagination page={propositions.page} total={propositions.count} adresse={adresseAmeliorations} libelle="Améliorations"/>}<Link href="/admin/retours" className="lien-discret mt-4 inline-block text-[12.5px]">Voir les retours →</Link></section>}
 </main>;
}
