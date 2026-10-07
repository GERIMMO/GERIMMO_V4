import {clientDeService} from '@/lib/supabase/service';
import {consignerTache,porteurDuSecret} from '@/lib/tache';
import {sujetMarketing,type SujetMarketing} from '@/lib/contenu-marketing';
import {evaluerPertinence} from '@/lib/pertinence-veille';
import {redigerArticleVeille} from '@/lib/redaction-veille';
import {couperAuMot} from '@/lib/utils';
import {lireSourceEtude} from '@/lib/analyse-veille';
import {creerVisuelMarketing} from '@/lib/visuel-marketing';
import {envoyerSurFacebook} from '@/lib/facebook';
import {alerterSuperviseurDuPost} from '@/lib/alerte-veto-marketing';
import {composantesParis,dateParis} from '@/lib/heure-paris-calcul';

// LA MISSION MARKETING EN DEUX TEMPS (06/10/2026).
//
// Jusqu'ici un seul passage, à 8 h UTC, préparait l'article, créait le visuel,
// le publiait et l'envoyait sur Facebook dans la même minute. Désormais :
//  - DIFFUSION : tout post « programmee » dont l'instant est venu paraît sur
//    le site puis sur Facebook (sauf refus, report, ou validation obligatoire
//    sans accord) ;
//  - PRÉPARATION : la veille au soir (réglage `heure_preparation_paris`), le
//    post du lendemain est rédigé, illustré, programmé à l'heure de Paris
//    choisie, et le superviseur est alerté (point du matin + e-mail).
// La base dit ce qui est dû (`cible_preparation_marketing`,
// `publications_marketing_echues`) ; cette route ne calcule plus d'heure.
// Elle est appelée toutes les cinq minutes par pg_cron (jeton généré en base)
// et reste idempotente : rien n'est préparé deux fois, rien n'est envoyé deux
// fois (réservations SQL).

export const dynamic='force-dynamic';
export const maxDuration=180;

/** Conservé pour les écrans et tests qui le lisent : la date et le jour ISO de Paris. */
export function maintenantParis(date=new Date()){
 const c=composantesParis(date);
 return {date:dateParis(date),jour:c.isodow,objet:new Date(`${dateParis(date)}T12:00:00Z`)};
}
const CHAMPS='id,titre,slug,chapo,statut,facebook_texte,facebook_image_url,facebook_post_id,facebook_envoi_demarre_le,image_empreinte,image_essais,image_en_cours_le,updated_at,programmee_pour,veille_source_id,marketing_jour';
type Article={id:string;titre:string;slug:string;chapo:string|null;statut:string;facebook_texte:string|null;facebook_image_url:string|null;facebook_post_id:string|null;facebook_envoi_demarre_le:string|null;image_empreinte:string|null;image_essais:number;image_en_cours_le:string|null;updated_at:string;programmee_pour:string|null;veille_source_id:string|null;marketing_jour:string|null};
type Reglages={actif:boolean;publication_automatique:boolean;diffusion_version:number;jours_semaine:number[];heure_paris:number;heure_preparation_paris:number;validation_obligatoire:boolean;veille_mots_inclus:string[];veille_mots_exclus:string[]};
type Db=NonNullable<ReturnType<typeof clientDeService>>;

// Reprise d'un visuel bloqué (audit 25/09, R2) : deux essais, puis une heure de pause.
const DELAI_REPRISE_MS=3600000;
export function visuelReprenable(a:{image_empreinte:string|null;image_essais:number;image_en_cours_le:string|null;updated_at:string},maintenant=Date.now()){
 if(a.image_empreinte||a.image_essais<2)return false;
 const dernier=Math.max(new Date(a.updated_at).getTime()||0,a.image_en_cours_le?new Date(a.image_en_cours_le).getTime()||0:0);
 return maintenant-dernier>DELAI_REPRISE_MS;
}

/** L'appel vient du cron Vercel (CRON_SECRET) ou de pg_cron (jeton généré en base). */
export async function appelAutorise(request:Request,db:Db){
 if(porteurDuSecret(request,process.env.CRON_SECRET))return true;
 const {data}=await db.rpc('jeton_declencheur_marketing');
 return typeof data==='string'&&data.length===64&&porteurDuSecret(request,data);
}

// ── Diffusion ──────────────────────────────────────────────────────────────
export async function diffuserPostsEchus(db:Db,r:Reglages,options:{manuel?:boolean}={}){
 const {data:ids,error}=await db.rpc('publications_marketing_echues');
 if(error)return {erreur:'Les posts à diffuser ne peuvent pas être lus.',diffuses:[] as string[],attentes:[] as string[],erreurs:[] as string[]};
 const diffuses:string[]=[],attentes:string[]=[],erreurs:string[]=[];
 for(const id of (ids??[]) as string[]){
  const {data:article}=await db.from('publications').select(CHAMPS).eq('id',id).maybeSingle();
  if(!article)continue;
  const a=article as Article;
  if(a.facebook_envoi_demarre_le){erreurs.push(`${a.id} : un envoi a déjà été engagé, à vérifier sur Facebook.`);continue;}
  // Parution sur le site : la base relit tout (accord, validation, texte complet, veille écartée).
  const parution=await db.rpc('publier_article_automatique',{p_id:a.id,p_manuel:options.manuel===true});
  if(parution.error){erreurs.push(`${a.id} : ${parution.error.message}`);continue;}
  if(parution.data!==true){attentes.push(a.id);continue;}
  const campagne=await db.from('marketing_campagnes').upsert({publication_id:a.id,nom:a.titre.slice(0,160),description:a.facebook_texte,canal:'facebook',nature:'organique',objectif:'notoriete',statut:'idee',publication_prevue_le:null,budget_cents:0},{onConflict:'publication_id'});
  if(campagne.error){erreurs.push(`${a.id} : fiche de suivi indisponible, Facebook non tenté.`);continue;}
  const reservation=await db.rpc('reserver_diffusion_facebook',{p_id:a.id,p_automatique:true});
  if(reservation.error||reservation.data!==true){erreurs.push(`${a.id} : paru sur le site, diffusion Facebook non réservée (plafond hebdomadaire ou pause).`);continue;}
  try{
   const resultat=await envoyerSurFacebook({titre:a.titre,chapo:a.chapo,slug:a.slug,facebookTexte:a.facebook_texte,facebookImageUrl:a.facebook_image_url});
   const trace=await db.from('publications').update({facebook_post_id:resultat.post_id,facebook_publie_le:new Date().toISOString(),facebook_erreur:null}).eq('id',a.id);
   if(trace.error){erreurs.push(`${a.id} : Facebook a répondu, confirmation non conservée. Ne pas renvoyer.`);continue;}
   await db.from('marketing_campagnes').update({statut:'terminee',fin_le:new Date().toISOString()}).eq('publication_id',a.id);
   diffuses.push(a.id);
  }catch{
   await db.from('publications').update({facebook_erreur:'La confirmation Facebook manque. Vérifiez la Page avant de renvoyer pour éviter un doublon.'}).eq('id',a.id);
   erreurs.push(`${a.id} : confirmation Facebook manquante.`);
  }
 }
 return {erreur:undefined as string|undefined,diffuses,attentes,erreurs};
}

// ── Préparation ────────────────────────────────────────────────────────────
type Cible={jour:string;rang:number;parution:string;rattrapage:boolean};

async function choisirSujet(db:Db,r:Reglages,cible:Cible):Promise<{sujet:SujetMarketing;source:string|null;motifs:string[]}|{erreur:string}>{
 const objet=new Date(`${cible.jour}T12:00:00Z`);
 const editorial=sujetMarketing(objet,Math.max(0,cible.rang));
 const motifs:string[]=[];
 // Une des deux prises de parole peut relayer une actualité récente étudiée.
 if(cible.rang!==0)return {sujet:editorial,source:null,motifs};
 const {data:infos,error}=await db.from('regulatory_watch').select('id,titre,source_url,source_nom,publie_source_le,etude').not('analyse_le','is',null).neq('statut','ecarte').gte('publie_source_le',new Date(Date.now()-30*86400000).toISOString()).order('publie_source_le',{ascending:false}).limit(10);
 if(error)return {erreur:'Les sources de veille ne peuvent pas être vérifiées.'};
 if(!infos?.length)return {sujet:editorial,source:null,motifs:['aucune veille récente']};
 const utilises=await db.from('publications').select('veille_source_id').in('veille_source_id',infos.map(i=>i.id));
 if(utilises.error)return {erreur:'L’historique des sujets est indisponible.'};
 const mots={inclus:r.veille_mots_inclus??[],exclus:r.veille_mots_exclus??[]};
 for(const info of infos){
  if(utilises.data?.some(p=>p.veille_source_id===info.id))continue;
  const etude=(info.etude??null) as {resume?:string;publics?:string[]}|null;
  const verdict=evaluerPertinence({titre:info.titre,resume:etude?.resume,publics:etude?.publics},mots);
  if(!verdict.pertinent){motifs.push(`${info.titre.slice(0,60)} : ${verdict.motif}`);continue;}
  // Rédaction ancrée dans la page officielle, lue maintenant. Échec = sujet éditorial.
  try{
   const texte=await lireSourceEtude(info.source_url);
   const sujet=await redigerArticleVeille({id:info.id,titre:info.titre,source_url:info.source_url,source_nom:info.source_nom,publie_source_le:info.publie_source_le},texte);
   return {sujet,source:info.id,motifs};
  }catch(e){motifs.push(`${info.titre.slice(0,60)} : ${e instanceof Error?e.message:'rédaction impossible'}`);}
 }
 return {sujet:editorial,source:null,motifs};
}

export async function preparerPostDu(db:Db,r:Reglages,cible:Cible){
 const existant=await db.from('publications').select(CHAMPS).eq('marketing_jour',cible.jour).maybeSingle();
 if(existant.error)return {erreur:'Impossible de vérifier les publications existantes.'};
 let article=existant.data as Article|null;const motifs:string[]=[];
 if(article&&!['brouillon','planifiee'].includes(article.statut))return {agi:false,raison:'Le créneau est déjà tenu.',article:article.id};
 if(!article){
  const choix=await choisirSujet(db,r,cible);
  if('erreur'in choix)return {erreur:choix.erreur};
  motifs.push(...choix.motifs);
  const {sujet,source}=choix;
  const creation=await db.from('publications').insert({marketing_jour:cible.jour,veille_source_id:source,periode:`marketing-auto-${cible.jour}`,statut:'brouillon',titre:sujet.titre,slug:`${cible.jour}-${sujet.cle}`,chapo:sujet.chapo,corps:sujet.corps,sources:[`audience:${sujet.audience}`,source?'veille-officielle-gerimmo':'contenu-editorial-gerimmo'],seo_description:couperAuMot(sujet.chapo,160),facebook_texte:sujet.facebook,publie_le:null}).select(CHAMPS).single();
  if(creation.error||!creation.data)return {erreur:'La préparation n’a pas été enregistrée. Aucun envoi effectué.'};
  article=creation.data as Article;
 }
 const campagne=await db.from('marketing_campagnes').upsert({publication_id:article.id,nom:article.titre.slice(0,160),description:article.facebook_texte,canal:'facebook',nature:'organique',objectif:'notoriete',statut:'idee',publication_prevue_le:cible.parution,budget_cents:0},{onConflict:'publication_id'});
 if(campagne.error)return {erreur:'La fiche de suivi n’a pas pu être préparée.',article:article.id};
 if(!article.image_empreinte){
  let reprise=false;
  if(visuelReprenable(article)){
   const remise=await db.from('publications').update({image_essais:0,image_en_cours_le:null}).eq('id',article.id).eq('image_essais',article.image_essais).select(CHAMPS).maybeSingle();
   if(remise.data){article=remise.data as Article;reprise=true;}
  }
  const reservation=await db.rpc('reserver_visuel_marketing',{p_id:article.id});
  if(reservation.error||reservation.data!==true)return {erreur:article.image_essais>=2?'Les deux essais de visuel sont épuisés ; la mission réessaiera d’elle-même après une heure. Aucun post sans image nouvelle.':'Le visuel est en préparation. Aucun post sans image nouvelle.',article:article.id,essais:article.image_essais,reprise};
  try{
   const apres=await db.from('publications').select(CHAMPS).eq('id',article.id).single();
   if(apres.error||!apres.data||!['brouillon','planifiee'].includes(apres.data.statut))throw new Error('Le sujet a changé.');
   article=apres.data as Article;
   const visuel=await creerVisuelMarketing(article.id,article.titre);
   const chemin=`${article.id}/${visuel.empreinte}.jpg`;
   const depot=await db.storage.from('marketing-visuels').upload(chemin,visuel.octets,{contentType:'image/jpeg',upsert:false,cacheControl:'31536000'});
   if(depot.error)throw new Error('Le visuel n’a pas pu être conservé.');
   const url=db.storage.from('marketing-visuels').getPublicUrl(chemin).data.publicUrl;
   if(!url.startsWith('https://'))throw new Error('Le visuel doit disposer d’une adresse publique sécurisée.');
   const sauvegarde=await db.from('publications').update({facebook_image_url:url,image_empreinte:visuel.empreinte,image_en_cours_le:null,facebook_erreur:null}).eq('id',article.id).eq('updated_at',article.updated_at).select(CHAMPS).maybeSingle();
   if(sauvegarde.error||!sauvegarde.data)throw new Error('Le sujet a changé ou le visuel existe déjà. La diffusion attend une vérification.');
   article=sauvegarde.data as Article;
  }catch(e){const message=e instanceof Error?e.message:'Le visuel doit être repris.';await db.from('publications').update({image_en_cours_le:null,facebook_erreur:message}).eq('id',article.id);return {erreur:message,article:article.id,essais:article.image_essais,reprise};}
 }
 // Programmation : la base refuse un texte à trous.
 const programmation=await db.rpc('programmer_publication_marketing',{p_id:article.id,p_pour:cible.parution});
 if(programmation.error)return {erreur:programmation.error.message,article:article.id};
 if(programmation.data!==true)return {erreur:'Le post n’a pas pu être programmé (agent en pause ou visuel manquant).',article:article.id};
 const alerte=await alerterSuperviseurDuPost(db,{id:article.id,titre:article.titre,chapo:article.chapo,facebook_texte:article.facebook_texte,facebook_image_url:article.facebook_image_url,programmee_pour:cible.parution,veille:Boolean(article.veille_source_id),rattrapage:cible.rattrapage,validation_obligatoire:r.validation_obligatoire});
 return {agi:true,preparees:1,article:article.id,parution:cible.parution,rattrapage:cible.rattrapage,alerte:alerte.envoye,...(alerte.motif?{alerte_motif:alerte.motif}:{}),...(motifs.length?{ecartes:motifs}:{})};
}

export async function GET(request:Request){
 const db=clientDeService();if(!db)return Response.json({erreur:'Configuration serveur incomplète.'},{status:503});
 if(!(await appelAutorise(request,db)))return Response.json({erreur:'Non autorisé.'},{status:401});
 const bilan=async(resultat:Record<string,unknown>,status=200)=>{await consignerTache(db,'marketing',resultat);return Response.json(resultat,{status});};
 const {data:r,error:reglage}=await db.from('marketing_reglages').select('*').eq('singleton',true).single();
 if(reglage||!r)return bilan({erreur:'Réglages marketing indisponibles.'},503);
 const reglages=r as Reglages;
 if(!reglages.actif)return bilan({agi:false,raison:'Agent en pause.'});
 // 1. Ce qui est échu part.
 const diffusion=await diffuserPostsEchus(db,reglages);
 // 2. Ce qui est dû se prépare.
 const {data:cibles,error:erreurCible}=await db.rpc('cible_preparation_marketing');
 if(erreurCible)return bilan({...diffusion,erreur:'La préparation ne peut pas être planifiée.'},503);
 const cible=(Array.isArray(cibles)?cibles[0]:null) as Cible|null;
 const preparation=cible?await preparerPostDu(db,reglages,cible):null;
 const erreur=diffusion.erreur||diffusion.erreurs.length||(preparation&&'erreur'in preparation);
 const resultat:Record<string,unknown>={agi:diffusion.diffuses.length>0||Boolean(preparation&&'agi'in preparation&&preparation.agi),publiees:diffusion.diffuses.length,facebook:diffusion.diffuses.length>0,
  ...(diffusion.diffuses.length?{diffusees:diffusion.diffuses}:{}),...(diffusion.attentes.length?{en_attente:diffusion.attentes}:{}),...(diffusion.erreurs.length||diffusion.erreur?{erreurs:[...(diffusion.erreur?[diffusion.erreur]:[]),...diffusion.erreurs]}:{}),
  ...(preparation?{preparation}:{raison_preparation:'Rien à préparer pour l’instant.'})};
 if(!resultat.agi&&!erreur&&!cible)resultat.raison='Rien d’échu, rien à préparer.';
 return bilan(resultat,erreur?503:200);
}
