// Le point du matin (25/09) : ce que chaque équipe a fait cette nuit, ce qui a
// échoué, et les décisions qu'elle soumet. `assemblerPoints` est pure et testée ;
// `genererPointsDuMatin` lit les tables et enregistre par la fonction SQL.
import type {SupabaseClient} from '@supabase/supabase-js';
import {EQUIPES,MISSIONS,missionsDeLEquipe,type Equipe,type Mission} from './missions';
import {resumerBilan} from './sante-service';
import {ETATS_DEVELOPPEMENT} from './pilotage';

export type PassageLu={id:string;mission:string;debut:string;fin:string|null;etat:string;compte:number;bilan:unknown};
export type LigneJournal={evenement:string;details:unknown;created_at:string};
export type SourceDecision='developpement'|'publication'|'artisan'|'retour'|'veille';
export type DecisionAssemblee={
 cle:string;titre:string;pourquoi:string;options:string[];recommandation:string;lien:string;
 source:SourceDecision;source_id:string;
 /** Valider en un clic est possible depuis le point (sinon : ouvrir l'écran). */
 validation:boolean;
 /** Refuser (avec motif) est possible depuis le point. */
 refus:boolean;
 /** Attestation à cocher avant de valider (gardes de l'écran d'origine). */
 attestation?:string;
 gestes?:{validation:boolean;refus:boolean;attestation?:string};
};
export type PassageDuPoint={mission:Mission;nom:string;debut:string;fin:string|null;etat:string;bilan:string};
export type ContenuPoint={
 passages:PassageDuPoint[];
 /** Ce que l'équipe a fait, en français, une ligne par passage utile. */
 realisations:string[];
 echecs:string[];
 /** Missions de l'équipe sans passage dans la fenêtre. */
 sans_passage:string[];
};
export type PointAssemble={equipe:Equipe;contenu:ContenuPoint;decisions:DecisionAssemblee[]};

export type Attentes={
 developpements:{id:string;titre:string;probleme:string|null;risque:string;statut:string;revision:string|null}[];
 publications:{id:string;titre:string;statut:string;corps:string|null}[];
 artisans:{artisan_id:string;raison_sociale:string;siret_etat:string;decennale_valide:boolean|null;rc_pro_deposee:boolean|null;nb_pieces:number|null}[];
 retours:{id:string;titre:string;nature:string;gravite:string;etat:string}[];
 veille:{id:string;titre:string;source_nom:string;etude:{resume?:string;action?:string;publics?:string[]}|null}[];
};
export const ATTENTES_VIDES:Attentes={developpements:[],publications:[],artisans:[],retours:[],veille:[]};

const ETATS_PASSAGE:Record<string,string>={reussi:'terminé',a_reprendre:'à vérifier',interrompu:'interrompu',en_cours:'en cours'};
const RISQUES:Record<string,string>={faible:'impact limité',moyen:'à examiner',eleve:'impact important',critique:'priorité critique'};
const EQUIPE_DES_SOURCES:Record<SourceDecision,Equipe>={developpement:'qualite',retour:'qualite',publication:'marketing',artisan:'incidents',veille:'conformite'};

function dansLaFenetre(iso:string,maintenant:Date,heures:number){const t=new Date(iso).getTime();return Number.isFinite(t)&&t<=maintenant.getTime()+60_000&&maintenant.getTime()-t<=heures*3_600_000;}
function aEchoue(bilan:unknown){
 if(!bilan||typeof bilan!=='object')return false;
 return Object.entries(bilan as Record<string,unknown>).some(([k,v])=>/(^|_)(erreur|echec)s?$/i.test(k)&&(typeof v==='number'?v>0:Array.isArray(v)?v.length>0:Boolean(v)));
}
/** Le bilan d'un passage : celui qu'il a gardé, sinon la ligne de journal de sa tâche pendant le passage. */
export function bilanDuPassage(p:PassageLu,journaux:LigneJournal[]):unknown{
 if(p.bilan&&typeof p.bilan==='object')return p.bilan;
 const debut=new Date(p.debut).getTime(),fin=p.fin?new Date(p.fin).getTime():debut+3_600_000;
 const ligne=journaux.find(l=>l.evenement===`tache_${p.mission}`&&new Date(l.created_at).getTime()>=debut-1000&&new Date(l.created_at).getTime()<=fin+60_000);
 return ligne?.details??null;
}
function decisionsDeLEquipe(equipe:Equipe,a:Attentes):DecisionAssemblee[]{
 const d:DecisionAssemblee[]=[];
 if(EQUIPE_DES_SOURCES.developpement===equipe)for(const p of a.developpements){
  if(p.statut!=='autorisation')continue;
  d.push({cle:`developpement:${p.id}`,titre:`Autoriser la version « ${p.titre} »`,pourquoi:`${ETATS_DEVELOPPEMENT[p.statut]??p.statut} · risque ${RISQUES[p.risque]??p.risque}.${p.probleme?` ${p.probleme.slice(0,300)}`:''}`,
   options:['Autoriser cette version contrôlée','Refuser la publication'],recommandation:p.revision?'Autoriser si les contrôles de cette version sont réussis ; ils sont revérifiés au moment du clic.':'Ouvrir le suivi : aucune version précise n’est encore attachée.',
   lien:'/admin/autonomie#ameliorations',source:'developpement',source_id:p.id,validation:Boolean(p.revision),refus:true});
 }
 if(EQUIPE_DES_SOURCES.retour===equipe)for(const r of a.retours){
  const idee=r.nature==='idee',bugN1=r.nature==='bug'&&r.gravite==='N1';
  if(!(idee&&['nouveau','en_examen'].includes(r.etat))&&!(bugN1&&['nouveau','en_examen'].includes(r.etat)))continue;
  d.push({cle:`retour:${r.id}`,titre:idee?`Retenir l’idée « ${r.titre} »`:`Prendre en charge le bug bloquant « ${r.titre} »`,
   pourquoi:idee?'Une idée d’utilisateur attend une réponse : retenue (un article d’annonce est préparé) ou non retenue, avec réexamen dans six mois.':'Un problème classé bloquant attend d’être pris en charge ; l’auteur reçoit votre réponse.',
   options:idee?['Retenir l’idée','Ne pas retenir (réexamen dans six mois)']:['Prendre en charge'],recommandation:idee?'Relire la description avant de retenir : le motif saisi est envoyé à l’auteur.':'Prendre en charge sans attendre ; le motif saisi est envoyé à l’auteur.',
   lien:`/admin/retours?nature=${r.nature}`,source:'retour',source_id:r.id,validation:true,refus:idee});
 }
 if(EQUIPE_DES_SOURCES.publication===equipe)for(const p of a.publications){
  if(!['proposition','brouillon'].includes(p.statut))continue;
  const complet=Boolean(p.corps&&p.corps.trim().length>=200&&!p.corps.includes('[['));
  d.push({cle:`publication:${p.id}`,titre:`Faire paraître « ${p.titre} »`,pourquoi:p.statut==='proposition'?'Sujet proposé par l’équipe, texte à rédiger dans l’éditeur.':complet?'Brouillon relu par l’équipe, prêt à paraître dans le journal.':'Brouillon incomplet : des passages restent à compléter dans l’éditeur.',
   options:['Faire paraître','Refuser avec un motif','Relire dans l’éditeur'],recommandation:complet?'Relire le texte une dernière fois puis faire paraître.':'Ouvrir l’éditeur : rien ne peut paraître tant que le texte n’est pas complet.',
   lien:`/admin/publications/${p.id}`,source:'publication',source_id:p.id,validation:complet,refus:true});
 }
 if(EQUIPE_DES_SOURCES.artisan===equipe)for(const ar of a.artisans){
  const siret=ar.siret_etat==='verifie';
  d.push({cle:`artisan:${ar.artisan_id}`,titre:`Accréditer ${ar.raison_sociale}`,pourquoi:`Inscription à examiner : SIRET ${siret?'vérifié':'à vérifier'}, ${ar.nb_pieces??0} justificatif(s), décennale ${ar.decennale_valide?'valide':'non confirmée'}, RC pro ${ar.rc_pro_deposee?'déposée':'absente'}.`,
   options:['Valider l’inscription','Refuser avec un motif communiqué à l’artisan'],recommandation:siret?'Valider après relecture des justificatifs.':'Vérifier d’abord le SIRET sur l’écran des artisans.',
   lien:'/admin/artisans',source:'artisan',source_id:ar.artisan_id,validation:siret,refus:true,attestation:siret?'J’ai relu les justificatifs et contrôlé leur conformité pour cette inscription.':undefined});
 }
 if(EQUIPE_DES_SOURCES.veille===equipe)for(const v of a.veille){
  const e=v.etude,complet=Boolean(e&&(e.resume?.trim().length??0)>=20&&(e.action?.trim().length??0)>=10&&e.publics?.length);
  d.push({cle:`veille:${v.id}`,titre:`Diffuser « ${v.titre} »`,pourquoi:`${v.source_nom} · ${complet?`étude préparée : ${e!.resume!.slice(0,240)}`:'l’étude n’est pas complète.'}`,
   options:['Diffuser aux utilisateurs concernés','Écarter'],recommandation:complet?'Lire la source officielle, puis diffuser si l’étude tient.':'Ouvrir la veille : compléter l’étude avant toute diffusion.',
   lien:'/admin/veille',source:'veille',source_id:v.id,validation:complet,refus:true});
 }
 // Les gestes sont aussi portés en JSON pour l'enregistrement (colonne `gestes`).
 return d.map(x=>({...x,gestes:{validation:x.validation,refus:x.refus,...(x.attestation?{attestation:x.attestation}:{})}}));
}
/**
 * Assemble le point de chaque équipe à partir des passages de la fenêtre
 * (24 h par défaut), des lignes `tache_*` du journal et des files de décision.
 */
export function assemblerPoints(entree:{passages:PassageLu[];journaux:LigneJournal[];attentes:Attentes;maintenant:Date;fenetreHeures?:number}):PointAssemble[]{
 const fenetre=entree.fenetreHeures??24;
 return (Object.keys(EQUIPES) as Equipe[]).map(equipe=>{
  const missions=missionsDeLEquipe(equipe);
  const passages:PassageDuPoint[]=[],realisations:string[]=[],echecs:string[]=[];
  for(const m of missions){
   const recents=entree.passages.filter(p=>p.mission===m&&dansLaFenetre(p.debut,entree.maintenant,fenetre)).sort((a,b)=>b.debut.localeCompare(a.debut));
   for(const p of recents){
    const bilan=bilanDuPassage(p,entree.journaux),texte=resumerBilan(bilan,m);
    passages.push({mission:m,nom:MISSIONS[m].nom,debut:p.debut,fin:p.fin,etat:p.etat,bilan:texte});
   }
   const dernier=recents[0];
   if(!dernier)continue;
   const bilan=bilanDuPassage(dernier,entree.journaux),texte=resumerBilan(bilan,m);
   if(texte!=='—')realisations.push(`${MISSIONS[m].nom} : ${texte}`);
   else if(dernier.etat==='reussi')realisations.push(`${MISSIONS[m].nom} : passage ${ETATS_PASSAGE[dernier.etat]}, aucun compte détaillé.`);
   if(dernier.etat==='a_reprendre'||dernier.etat==='interrompu')echecs.push(`${MISSIONS[m].nom} : passage ${ETATS_PASSAGE[dernier.etat]}.`);
   else if(aEchoue(bilan))echecs.push(`${MISSIONS[m].nom} : des éléments ont échoué (${texte}).`);
  }
  const sans_passage=missions.filter(m=>!passages.some(p=>p.mission===m)).map(m=>MISSIONS[m].nom);
  return {equipe,contenu:{passages,realisations,echecs,sans_passage},decisions:decisionsDeLEquipe(equipe,entree.attentes)};
 });
}

// ── Lecture des tables et enregistrement ───────────────────────────────────
type Lecteur=Pick<SupabaseClient,'from'|'rpc'>;
export async function lireAttentes(db:Lecteur):Promise<{attentes:Attentes;indisponibles:string[]}>{
 const [dev,pub,art,ret,vei]=await Promise.all([
  db.from('development_proposals').select('id,titre,probleme,risque,statut,revision').eq('statut','autorisation').order('updated_at',{ascending:false}).limit(30),
  db.from('publications').select('id,titre,statut,corps').in('statut',['proposition','brouillon']).order('propose_le',{ascending:false}).limit(30),
  db.rpc('artisans_a_valider'),
  db.from('retours_utilisateurs').select('id,titre,nature,gravite,etat').in('etat',['nouveau','en_examen']).or('nature.eq.idee,and(nature.eq.bug,gravite.eq.N1)').order('cree_le',{ascending:false}).limit(30),
  db.from('regulatory_watch').select('id,titre,source_nom,etude').eq('statut','a_examiner').not('analyse_le','is',null).order('reperage_le',{ascending:false}).limit(30),
 ]);
 const indisponibles=[[dev,'évolutions'],[pub,'publications'],[art,'artisans'],[ret,'retours'],[vei,'veille']].filter(([r])=>(r as {error:unknown}).error).map(([,n])=>n as string);
 return {indisponibles,attentes:{
  developpements:(dev.error?[]:dev.data??[]) as Attentes['developpements'],
  publications:(pub.error?[]:pub.data??[]) as Attentes['publications'],
  artisans:(art.error||!Array.isArray(art.data)?[]:art.data) as Attentes['artisans'],
  retours:(ret.error?[]:ret.data??[]) as Attentes['retours'],
  veille:(vei.error?[]:vei.data??[]) as Attentes['veille'],
 }};
}
/** Le jour du point : la date de Paris. */
export function jourDuPoint(maintenant:Date=new Date()):string{return maintenant.toLocaleDateString('en-CA',{timeZone:'Europe/Paris'});}
/**
 * Génère (ou régénère) le point de chaque équipe pour le jour donné. Appelée à
 * la fin de chaque passage par le traitement, et par le superviseur à la demande.
 * Ne lève jamais : un point manquant ne doit pas faire échouer un passage.
 */
export async function genererPointsDuMatin(db:Lecteur,maintenant:Date=new Date()):Promise<{enregistres:number;erreur?:string}>{
 try{
  const [passages,journaux,{attentes}]=await Promise.all([
   db.from('agent_passages').select('id,mission,debut,fin,etat,compte,bilan').gte('debut',new Date(maintenant.getTime()-24*3_600_000).toISOString()).order('debut',{ascending:false}).limit(200),
   db.from('tech_log').select('evenement,details,created_at').like('evenement','tache_%').gte('created_at',new Date(maintenant.getTime()-25*3_600_000).toISOString()).order('created_at',{ascending:false}).limit(300),
   lireAttentes(db),
  ]);
  if(passages.error)return {enregistres:0,erreur:'Les passages sont indisponibles.'};
  const points=assemblerPoints({passages:(passages.data??[]) as PassageLu[],journaux:(journaux.error?[]:journaux.data??[]) as LigneJournal[],attentes,maintenant});
  const jour=jourDuPoint(maintenant);let enregistres=0;
  for(const p of points){
   const {error}=await db.rpc('enregistrer_point_du_matin',{p_jour:jour,p_equipe:p.equipe,p_contenu:p.contenu,p_decisions:p.decisions});
   if(error)console.error('[point du matin]',p.equipe,error.message);else enregistres++;
  }
  return {enregistres,erreur:enregistres<points.length?'Une partie des points n’a pas pu être enregistrée.':undefined};
 }catch(e){return {enregistres:0,erreur:e instanceof Error?e.message:'Le point n’a pas pu être préparé.'};}
}
