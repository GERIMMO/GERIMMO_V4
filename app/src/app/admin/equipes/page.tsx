import { MesureAutonomie } from "@/components/mesure-autonomie";
import { TitreEcran } from "@/components/titre-ecran";
import Link from "next/link";
import { Activity, ArrowUpRight, BookOpenCheck, ChevronDown, CircleAlert, Clock3, Pause, RefreshCw, Settings2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EQUIPES, MISSIONS, type Mission } from "@/lib/missions";
import { bilanLisible, chargerEtatTaches, type EtatTache, type PassageDeMission } from "@/lib/sante-service";
import { formaterDateHeureParis, NOTE_FUSEAU } from "@/lib/heure-paris";
import { AtelierQualite } from "./qualite";
import { Commandes } from "./commandes";
import { FiltreMissions, type MissionCard } from "./filtre-missions";
import console from "../console-direction.module.css";
import base from "../repertoires.module.css";
import styles from "../pilotage.module.css";
export const metadata={title:"Automatismes et consignes"};
const names:Record<string,string>={reussi:"Exécution terminée",a_reprendre:"À vérifier",interrompu:"Exécution interrompue",en_cours:"En cours"};
const labels:Record<EtatTache,[string,string]>={ok:["À l’heure","vert"],echec:["Échec à vérifier","rouge"],retard:["En retard","rouge"],jamais:["Première exécution attendue","ambre"],non_configuree:["Service non relié","ambre"],pause:["En pause","gris"]};
const effects:Record<Mission,string>={
 veille:"Relève les sources réglementaires et prépare les informations à examiner.",
 appels:"Prépare et envoie les avis d’échéance selon les autorisations de chaque client.",
 quittances:"Prépare et envoie les quittances éligibles selon les réglages des clients.",
 relances:"Relance les loyers concernés lorsque le client a autorisé les envois automatiques.",
 rappels:"Traite les rappels de rendez-vous, les invitations et le suivi des dossiers éligibles.",
 abonnements:"Synchronise les abonnements et applique les règles de suivi de facturation.",
 signatures:"Suit les signatures et le classement des documents concernés.",
 marketing:"Prépare les contenus et traite les publications autorisées par vos réglages marketing.",
 territoire:"Actualise les données du marché et prépare les études territoriales.",
 purge:"Supprime physiquement les fichiers déjà désignés par les règles de conservation.",
};
export default async function Page(){
 const db=await createClient();
 const [rules,history,tasks]=await Promise.all([db.from("agent_missions").select("cle,active"),db.from("agent_passages").select("id,mission,debut,fin,expiration,etat,resume,compte,bilan").order("debut",{ascending:false}).limit(200),chargerEtatTaches(db)]);
 const available=!rules.error&&!history.error&&tasks!==null;
 const launch=Boolean(process.env.CRON_SECRET?.trim());
 const cards:MissionCard[]=Object.entries(MISSIONS).map(([key,m])=>{
  const rule=rules.data?.find(r=>r.cle===key);const task=tasks?.find(t=>t.nom===key);
  const known=available&&!!rule&&!!task;
  const [label,tone]=known?labels[task.etat]:["État indisponible","gris"];
  const state:MissionCard["state"]=!known?"unknown":task.etat==="pause"?"pause":task.etat==="ok"?"ok":"attention";
  const passages=(history.data?.filter(p=>p.mission===key)??[]) as (PassageDeMission&{id:string})[];const last=passages[0];
  return {id:key,name:m.nom,team:EQUIPES[m.equipe].nom,state,content:<section className={`${styles.mission} ${console.ligneMission}`} data-state={state} aria-labelledby={`mission-${key}`}>
   <div><h2 id={`mission-${key}`}>{m.nom}</h2><span className={base.badge} data-tone={tone}>{label}</span></div>
   <div className={styles.result}><strong>Dernière exécution</strong>{history.error?<p>Historique indisponible.</p>:last?<><time dateTime={last.debut}>{formaterDateHeureParis(last.debut)}</time><p>{names[last.etat]??"État à vérifier"}{state==="attention"&&<> · {bilanLisible(last)}</>}</p></>:<p>Aucune exécution enregistrée.</p>}   <details className={console.detail}><summary>Détails techniques</summary>
    <p>{EQUIPES[m.equipe].nom} · {effects[key as Mission]}</p>
    <p className={styles.schedule}><Clock3 size={13} className="mr-1 inline" aria-hidden="true"/>{!known?"Programmation à vérifier":!rule.active?"Programmation en pause":`Horaire habituel : ${m.heure}`}</p>
    {last&&<p>{bilanLisible(last)}</p>}
    {passages.length>1&&<><h3>Exécutions précédentes</h3><ol>{passages.slice(1,4).map(p=><li key={p.id}><time dateTime={p.debut}>{formaterDateHeureParis(p.debut)}</time><p>{names[p.etat]??"État à vérifier"} · {bilanLisible(p)}</p></li>)}</ol></>}
   </details></div>
   <div className={console.actionsMission}>{state==="unknown"&&<p className="mb-2 text-sm text-muted-foreground">Actualisez pour vérifier l’état.</p>}{known&&<Commandes mission={key as Mission} active={rule.active} lancement={launch}/>}<Link className={styles.link} href={m.lien}>Ouvrir les dossiers <ArrowUpRight size={14} aria-hidden="true"/></Link></div>

  </section>};
 });
 const attention=cards.filter(c=>c.state==="attention").length;const paused=cards.filter(c=>c.state==="pause").length;const healthy=cards.filter(c=>c.state==="ok").length;
 return <main className={base.page}>
  <header className={base.header}><div><TitreEcran rubrique="personnes">Automatismes et consignes</TitreEcran><p className={base.subtitle}>Vérifiez les exécutions, puis intervenez sur les tâches qui le demandent.</p></div><div className={styles.actions}><a href="/admin/equipes" className="btn-secondaire"><RefreshCw size={15} aria-hidden="true"/>Actualiser</a><Link href="/admin/consignes" className="btn-secondaire"><BookOpenCheck size={16} aria-hidden="true"/>Consignes du dirigeant</Link></div></header>
  <div className={base.stats}>{[{n:cards.length,title:"Tâches suivies",detail:"Les missions de Gerimmo",icon:Settings2,tone:"bleu"},{n:healthy,title:"À l’heure",detail:"Dernière exécution confirmée",icon:Activity,tone:"vert"},{n:attention,title:"À vérifier",detail:"Retard, connexion ou première exécution",icon:CircleAlert,tone:"ambre"},{n:paused,title:"En pause",detail:"Pause volontaire",icon:Pause,tone:"bleu"}].map((s,i)=><div key={s.title} className={base.stat} data-tone={s.tone}><span className={base.statIcon}><s.icon size={19} aria-hidden="true"/></span><strong>{i===0||available?s.n:"—"}</strong><span>{s.title}</span><small>{s.detail}</small></div>)}</div>
  {!available&&<p role="alert" className={styles.notice}>Le suivi est indisponible. Actualisez avant de vous fier aux états des tâches.</p>}
  <p className={console.consignes}>Mettre en pause arrête les prochaines exécutions ; une tâche déjà commencée peut se terminer. <Link className="underline" href="/admin/relais">Vacances et relais : limites et arrêt d’urgence</Link>.</p>

  {!launch&&<div className={styles.notice}><CircleAlert size={17} aria-hidden="true"/><p>Le lancement manuel attend la connexion des traitements. <Link href="/admin/sante" className="underline">Vérifier les connexions</Link>.</p></div>}
  <section className={styles.section}><div className={styles.sectionTitle}><div><h2>Vos tâches automatiques</h2><p>Consultez le dernier résultat avant de relancer une tâche.</p></div></div><FiltreMissions items={cards}/><p className={styles.note}>{NOTE_FUSEAU} Horaires indicatifs de configuration ; une pause ou un arrêt peut empêcher le passage. L’historique détaillé reprend les 200 derniers passages enregistrés, toutes missions confondues.</p></section>
  <details className={console.detail}><summary>Détails techniques — fonctionnement et consignes</summary>  <div className={styles.hero}><section className={`${styles.panel} ${styles.feature}`}><div className={styles.head}><div><p className={styles.eyebrow}>VOTRE CADRE DE FONCTIONNEMENT</p><h2>Des tâches suivies, des limites claires</h2></div><span className={styles.icon}><ShieldCheck size={21} aria-hidden="true"/></span></div><p className={styles.intro}>Chaque tâche conserve son résultat. La mise en pause bloque les prochains passages ; un traitement déjà commencé peut se terminer.</p><div className={`${styles.actions} mt-4`}><Link className={styles.link} href="/admin/relais">Vacances et relais <ArrowUpRight size={15} aria-hidden="true"/></Link><Link className={styles.link} href="/admin/journaux">Voir l’historique complet <ArrowUpRight size={15} aria-hidden="true"/></Link></div></section><aside className={`${styles.panel} ${styles.gold}`}><p className={styles.eyebrow}>CONSIGNES ET ABSENCES</p><h2>Préparer le relais</h2><p className={`${styles.intro} mt-3`}>Vos consignes de lecture précisent un responsable, une période et les opérations permises. Le plan de vacances définit les alertes et les escalades.</p><div className={`${styles.actions} mt-3`}><Link className={styles.link} href="/admin/consignes">Gérer les consignes <ArrowUpRight size={14} aria-hidden="true"/></Link><Link className={styles.link} href="/admin/relais">Préparer une absence <ArrowUpRight size={14} aria-hidden="true"/></Link></div></aside></div></details>
  <details className={styles.fold}><summary><span className={styles.icon}><Settings2 size={19} aria-hidden="true"/></span><div><h2>Atelier qualité et corrections</h2><p>Décrire une amélioration et suivre sa préparation avant validation.</p></div><ChevronDown size={18} aria-hidden="true"/></summary><div className={styles.foldBody}><AtelierQualite preparation={Boolean(process.env.GITHUB_AGENT_TOKEN)} demonstration={Boolean(process.env.VERCEL_TOKEN&&process.env.VERCEL_PROJECT_ID)} active={process.env.GERIMMO_CODEX_ENABLED==="true"}/></div></details>
  <details id="mesures" className={styles.fold}><summary><span className={styles.icon}><Activity size={19} aria-hidden="true"/></span><div><h2>Résultats de l’automatisation</h2><p>Consulter les mesures et leur périmètre.</p></div><ChevronDown size={18} aria-hidden="true"/></summary><div className={styles.foldBody}><MesureAutonomie detail titre="Résultats de l’automatisation"/></div></details>
 </main>;
}
