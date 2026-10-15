import Link from "next/link";
import { formaterDateHeureParis, formaterDateParis } from '@/lib/heure-paris';
import { ArrowLeft, ArrowRight, BookOpen, Inbox, LifeBuoy, Lightbulb, MessageCircle, Plus, ShieldCheck } from "lucide-react";
import styles from "./assistance.module.css";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { destinationSure } from "@/lib/destination-sure";
import { actionSansDonnees, ecranSansDonnees, ETATS_RETOUR, pageRetour, type RetourUtilisateur } from "@/lib/retours";
import { baseEspace, versRouteAgence } from "@/lib/racine-espace";
import { FormulaireRetour, SoutenirIdee } from "./formulaire-retour";
import { MarqueGerimmo } from "@/components/marque-gerimmo";
// Couleur de la puce selon l'état (24/09) : toujours orange jusqu'ici, même
// « Résolu ». Comme ailleurs : vert = terminé, gris = écarté, orange = en attente.
const PUCE_ETAT:Record<string,string>={resolu:'puce-loue',retenue:'puce-loue',deja_couverte:'puce-loue',non_retenue:'puce-grise'};
export type ParametresAssistance = { ecran?: string; action?: string; type?: string; sel?: string; vue?: string; page?: string; pageIdees?: string; retour?: string };
export async function ContenuAssistance({searchParams, orgIdIntegre}:{searchParams:Promise<ParametresAssistance>; orgIdIntegre?:string}){
 const params=await searchParams;const c=await createClient();const{data:{user}}=await c.auth.getUser();if(!user)redirect('/connexion?suite=%2Fassistance');
 const page=pageRetour(params.page);
 // D27 : l'aide intégrée n'existe que dans l'espace du propriétaire direct (/espace/<id>/faq).
 const cheminAssistance=orgIdIntegre?`${baseEspace(orgIdIntegre,true)}/faq`:'/assistance';
 const Conteneur=orgIdIntegre?'section':'main';
 const vue=orgIdIntegre?'suivi':params.vue==='idees'?'idees':params.vue==='agence'?'agence':'suivi';
 // Retour à la page d'où l'aide a été ouverte (24/09). Le bouton transmet le
 // chemin réel ; il n'est jamais stocké (seul `ecran`, anonymisé, part avec la
 // demande) et ne sert qu'aux liens de cette page. destinationSure n'accepte
 // qu'un chemin interne ; /assistance elle-même est écartée.
 const retourSur=destinationSure(params.retour,'');const retour=/^\/assistance(\/|$|[?#])/.test(retourSur)?'':retourSur;
 // Le contexte d'arrivée suit les changements de vue et de page : sinon le
 // lien de retour et l'écran joint à la demande se perdaient au premier clic.
 const contexte=new URLSearchParams();if(params.ecran)contexte.set('ecran',ecranSansDonnees(params.ecran));if(params.action)contexte.set('action',actionSansDonnees(params.action));if(retour)contexte.set('retour',retour);
 const lien=(extra:Record<string,string>,ancre:string)=>{const q=new URLSearchParams(extra);contexte.forEach((v,k)=>q.set(k,v));const s=q.toString();return `${cheminAssistance}${s?`?${s}`:''}${ancre}`;};
 const onglet=(v:string)=>`${styles.onglet} ${vue===v?styles.actif:""}`;
 const [adhesions,fiche]=await Promise.all([c.from('memberships').select('organization_id,role,organizations(name)').eq('account_id',user.id).eq('status','active'),c.from('artisans').select('id').eq('account_id',user.id).maybeSingle()]);
 const organisations=(adhesions.data??[]).filter(m=>m.organization_id).map(m=>({id:m.organization_id as string,nom:(m.organizations as unknown as {name:string}|null)?.name??'Mon organisation'}));
 const orgAdmin=(adhesions.data??[]).filter(m=>m.role==='admin_agence').map(m=>m.organization_id as string);
 const espacesProprietaire=(adhesions.data??[]).filter(m=>m.role==='proprietaire_direct');
 // La page d'où l'aide a été ouverte peut porter l'une ou l'autre racine (/espace/<id> aujourd'hui, /agence/<id> pour un ancien lien) : on la compare sous la racine des dossiers.
 const retourRoute=versRouteAgence(retour);
 const espaceAide=espacesProprietaire.find(m=>retourRoute.startsWith(`/agence/${m.organization_id}/`)||retourRoute===`/agence/${m.organization_id}`)??(espacesProprietaire.length===1?espacesProprietaire[0]:null);
 const aide=espaceAide?`${baseEspace(espaceAide.organization_id as string,true)}/faq`:null;
 if(!orgIdIntegre&&aide&&params.type!=='contestation'&&(retourRoute.startsWith(`/agence/${espaceAide!.organization_id}`)||(!retour&&!fiche.data&&(adhesions.data??[]).every(m=>m.role==='proprietaire_direct')))){
  const q=new URLSearchParams(contexte);for(const cle of ['type','sel','page','pageIdees'] as const)if(params[cle])q.set(cle,params[cle]!);if(params.vue==='idees'&&params.page){q.delete('page');q.set('pageIdees',params.page);}
  redirect(`${aide}${q.size?`?${q}`:''}${params.vue==='idees'?'#idees':params.sel?'#mes-demandes':'#nouvelle'}`);
 }
 let requete=c.from('retours_utilisateurs').select('*',{count:'exact'}).order('cree_le',{ascending:false}).range((page-1)*20,page*20-1);
 if(vue==='idees')requete=requete.eq('nature','idee');else if(vue==='agence')requete=requete.in('organization_id',orgAdmin.length?orgAdmin:['00000000-0000-0000-0000-000000000000']);else requete=requete.eq('auteur_id',user.id);
 const{data,error,count}=await requete;const retours=(data??[]) as RetourUtilisateur[];
 const pageIdees=pageRetour(params.pageIdees??(orgIdIntegre&&params.vue==='idees'?params.page:undefined));
 const resultatIdees=orgIdIntegre?await c.from('retours_utilisateurs').select('*',{count:'exact'}).eq('nature','idee').order('cree_le',{ascending:false}).range((pageIdees-1)*20,pageIdees*20-1):null;
 const idees=(resultatIdees?.data??[]) as RetourUtilisateur[];
 const ids=[...new Set([...retours,...idees].map(r=>r.id))];const traces=ids.length?await c.from('retours_historique').select('id,retour_id,evenement,message,cree_le').in('retour_id',ids).order('cree_le',{ascending:true}):{data:[],error:null};
 const afficherDemandes=(liste:RetourUtilisateur[], prefixe="demande")=>liste.map(r=>{
      const etapes=(traces.data??[]).filter(t=>t.retour_id===r.id);const derniere=etapes.at(-1);const anterieures=etapes.slice(0,-1);
      return <article id={`${prefixe}-${r.id}`} key={r.id} className={styles.demande} data-selectionnee={params.sel===r.id}>
       <div className={styles.demandeEntete}><h3>{r.titre}</h3><span className={`puce ${PUCE_ETAT[r.etat]??'puce-prep'}`}>{ETATS_RETOUR[r.etat]}</span></div>
       <p className={styles.reference}><time dateTime={r.cree_le}>{formaterDateParis(r.cree_le)}</time> · Réf. {r.id.slice(0,8).toUpperCase()}</p><p className={styles.description}>{r.description}</p>
       {r.reexaminer_le&&<p className="mt-3 text-sm">Réexamen prévu le {new Date(r.reexaminer_le+'T12:00:00').toLocaleDateString('fr-FR')}.</p>}
       {derniere&&<div className={styles.reponse}><p>{derniere.evenement==='creation'?'Suivi':'Réponse de Gerimmo'} · <time dateTime={derniere.cree_le}>{formaterDateHeureParis(derniere.cree_le)}</time></p><p>{derniere.message}</p></div>}
       {anterieures.length>0&&<details open={params.sel===r.id} className={styles.historique}><summary>Étapes précédentes ({anterieures.length})</summary><ol>{anterieures.map(t=><li key={t.id}><time>{formaterDateHeureParis(t.cree_le)}</time><p>{t.message}</p></li>)}</ol></details>}
       {r.nature==='idee'&&<SoutenirIdee id={r.id}/>}
      </article>;
     });
 return <div className={orgIdIntegre?styles.integre:styles.fond}>
  {!orgIdIntegre&&<header className={`bandeau-appli ${styles.bandeau}`}><div><MarqueGerimmo tuile/><nav aria-label="Revenir dans Gerimmo">
   {retour&&<Link href={retour} className="lien-bandeau"><ArrowLeft size={15} aria-hidden="true"/> Retour à ma page</Link>}
   <Link href="/espaces" className="lien-bandeau">Mes espaces</Link></nav></div></header>}
  <Conteneur className={orgIdIntegre?styles.pageIntegree:styles.page}>
   {!orgIdIntegre&&<div className={styles.entete}><div><p className={styles.surtitre}><LifeBuoy size={16} aria-hidden="true"/> À votre écoute</p><h1>Aide et retours</h1><p>Une question, un problème, une idée : échangez avec l’équipe Gerimmo et suivez ses réponses.</p></div>{aide&&<Link href={aide}><BookOpen size={17} aria-hidden="true"/> Centre d’aide <ArrowRight size={15} aria-hidden="true"/></Link>}</div>}
   {!orgIdIntegre&&<nav aria-label="Suivi des demandes" className={styles.navigation}>
    <Link className={onglet('suivi')} href={lien({},'#mes-demandes')} aria-current={vue==='suivi'?'page':undefined}><MessageCircle size={20} aria-hidden="true"/><span><strong>Mes demandes</strong><small>Écrire et retrouver vos réponses</small></span></Link>
    <Link className={onglet('idees')} href={lien({vue:'idees'},'#mes-demandes')} aria-current={vue==='idees'?'page':undefined}><Lightbulb size={20} aria-hidden="true"/><span><strong>Les idées de mes espaces</strong><small>Proposer et soutenir une amélioration</small></span></Link>
    {orgAdmin.length>0&&<Link className={onglet('agence')} href={lien({vue:'agence'},'#mes-demandes')} aria-current={vue==='agence'?'page':undefined}><ShieldCheck size={20} aria-hidden="true"/><span><strong>Suivi de mon agence</strong><small>Les demandes de votre équipe</small></span></Link>}
   </nav>}
   <div className={styles.contenu} data-formulaire={vue==='suivi'}>
    {vue==='suivi'&&<section id="nouvelle" className={styles.nouvelle} aria-labelledby="nouvelle-titre"><div className={styles.titreSection}><span>{orgIdIntegre?<MessageCircle size={19} aria-hidden="true"/>:<Plus size={19} aria-hidden="true"/>}</span><div><h2 id="nouvelle-titre">{orgIdIntegre?"Contacter Gerimmo":"Nouvelle demande"}</h2><p>Choisissez le sujet, puis expliquez-nous votre besoin.</p></div></div><FormulaireRetour cle={randomUUID()} cheminAssistance={cheminAssistance} ecran={ecranSansDonnees(params.ecran??'/espaces')} action={actionSansDonnees(params.action??'')} organisations={organisations} contestation={Boolean(fiche.data)&&params.type==='contestation'} idee={params.type==='idee'} retour={retour} contexte={contexte.toString()}/></section>}
    <div className={styles.colonneSuivi}>
    <section id="mes-demandes" className={styles.suivi} aria-labelledby="suivi-titre">
     <div className={styles.titreSuivi}><h2 id="suivi-titre">{orgIdIntegre&&<Inbox size={20} aria-hidden="true"/>}{vue==='idees'?'Idées à soutenir':vue==='agence'?'Demandes de mon agence':'Mes demandes et réponses'}</h2>{!error&&<span aria-label={`${count??retours.length} demandes`}>{count??retours.length}</span>}</div>
     {(error||traces.error||adhesions.error)&&<p role="alert" className={styles.erreur}>Le suivi n’a pas pu être chargé complètement. Rechargez avant de conclure qu’une demande est absente.</p>}
     {!error&&!traces.error&&!adhesions.error&&retours.length===0&&<div className={styles.vide}><span><Inbox size={27} aria-hidden="true"/></span><h3>{page>1?'Aucune demande sur cette page':vue==='idees'?'Vos idées ont leur place ici':vue==='agence'?'Aucune demande pour le moment':'Vous n’avez pas encore de demande'}</h3><p>{page>1?'Revenez à la page précédente pour retrouver vos demandes.':vue==='idees'?'Une amélioration faciliterait votre quotidien ? Partagez-la avec votre espace.':vue==='agence'?'Les nouvelles demandes de votre équipe apparaîtront ici.':'Après l’envoi, retrouvez ici le statut de votre demande et toutes les réponses de Gerimmo.'}</p>{vue==='idees'&&<Link href={lien({type:'idee'},'#nouvelle')}>Proposer une idée <ArrowRight size={14} aria-hidden="true"/></Link>}</div>}
     {afficherDemandes(retours)}
     {((count??0)>20||page>1)&&<nav aria-label="Pages des demandes" className={styles.pagination}>{page>1?<Link href={lien({...(orgIdIntegre?{pageIdees:String(pageIdees)}:{vue}),page:String(page-1)},'#mes-demandes')}>Précédente</Link>:<span/>}<span>Page {page}</span>{page*20<(count??0)?<Link href={lien({...(orgIdIntegre?{pageIdees:String(pageIdees)}:{vue}),page:String(page+1)},'#mes-demandes')}>Suivante</Link>:<span/>}</nav>}
     {!orgIdIntegre&&vue==='suivi'&&aide&&<Link className={styles.aideLien} href={aide}><BookOpen size={18} aria-hidden="true"/><span><strong>Une réponse immédiate ?</strong><small>Consultez les questions fréquentes</small></span><ArrowRight size={16} aria-hidden="true"/></Link>}
    </section>
   {orgIdIntegre&&<section id="idees" className={styles.ideesIntegrees} aria-labelledby="idees-titre">
    <div className={styles.titreSuivi}><h2 id="idees-titre"><Lightbulb size={20} aria-hidden="true"/> Les idées de mes espaces</h2>{!resultatIdees?.error&&<span>{resultatIdees?.count??idees.length}</span>}</div>
    {resultatIdees?.error?<p role="alert" className={styles.erreur}>Les idées n’ont pas pu être chargées. Réessayez dans un instant.</p>:idees.length?afficherDemandes(idees,"idee"):<div className={styles.ideesVides}><strong>{pageIdees>1?"Aucune idée sur cette page.":"Votre avis fait avancer Gerimmo"}</strong><p>Retrouvez ici les améliorations proposées et soutenez celles qui vous sont utiles.</p><a href="#nouvelle">Ouvrir le formulaire <ArrowRight size={14} aria-hidden="true"/></a></div>}
    {((resultatIdees?.count??0)>20||pageIdees>1)&&<nav aria-label="Pages des idées" className={styles.pagination}>{pageIdees>1?<Link href={lien({page:String(page),pageIdees:String(pageIdees-1)},'#idees')}>Précédente</Link>:<span/>}<span>Page {pageIdees}</span>{pageIdees*20<(resultatIdees?.count??0)?<Link href={lien({page:String(page),pageIdees:String(pageIdees+1)},'#idees')}>Suivante</Link>:<span/>}</nav>}
   </section>}
   </div>
   </div>
  </Conteneur>
 </div>;
}
