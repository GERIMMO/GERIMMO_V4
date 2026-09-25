import {clientDeService} from '@/lib/supabase/service';
import {consignerTache,porteurDuSecret} from '@/lib/tache';
import {sujetMarketing} from '@/lib/contenu-marketing';
import {sujetDeVeille} from '@/lib/sujet-veille-marketing';
import {lireSourceEtude} from '@/lib/analyse-veille';
import {creerVisuelMarketing} from '@/lib/visuel-marketing';
import {envoyerSurFacebook} from '@/lib/facebook';

export const dynamic='force-dynamic';
export const maxDuration=180;
export function maintenantParis(date=new Date()){
 const parties=new Intl.DateTimeFormat('fr-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(date);
 const p=Object.fromEntries(parties.map(x=>[x.type,x.value]));
 const jours:Record<string,number>={lun:1,mar:2,mer:3,jeu:4,ven:5,sam:6,dim:7};
 return {date:`${p.year}-${p.month}-${p.day}`,jour:jours[p.weekday.replace('.','')]??0,objet:new Date(`${p.year}-${p.month}-${p.day}T12:00:00Z`)};
}
const CHAMPS='id,titre,slug,chapo,statut,facebook_texte,facebook_image_url,facebook_post_id,facebook_envoi_demarre_le,image_empreinte,image_essais,image_en_cours_le,updated_at';
// Reprise d'un visuel bloqué (audit 25/09, R2) : `reserver_visuel_marketing`
// refuse au-delà de deux essais et rien ne remettait le compteur à zéro —
// l'article restait bloqué sans geste possible hors SQL. Une passe ultérieure
// (tâche du lendemain ou relance manuelle de la mission) remet le compteur à
// zéro si le dernier essai date de plus d'une heure : deux nouveaux essais,
// jamais une boucle dans la même passe. Le motif du dernier échec reste dans
// `facebook_erreur` et dans le bilan consigné.
const DELAI_REPRISE_MS=3600000;
export function visuelReprenable(a:{image_empreinte:string|null;image_essais:number;image_en_cours_le:string|null;updated_at:string},maintenant=Date.now()){
 if(a.image_empreinte||a.image_essais<2)return false;
 const dernier=Math.max(new Date(a.updated_at).getTime()||0,a.image_en_cours_le?new Date(a.image_en_cours_le).getTime()||0:0);
 return maintenant-dernier>DELAI_REPRISE_MS;
}
export async function GET(request:Request){
 if(!porteurDuSecret(request,process.env.CRON_SECRET))return Response.json({erreur:'Non autorisé.'},{status:401});
 const db=clientDeService();if(!db)return Response.json({erreur:'Configuration serveur incomplète.'},{status:503});
 const bilan=async(resultat:Record<string,unknown>,status=200)=>{await consignerTache(db,'marketing',resultat);return Response.json(resultat,{status});};
 const {data:r,error:reglage}=await db.from('marketing_reglages').select('*').eq('singleton',true).single();
 if(reglage||!r)return bilan({erreur:'Réglages marketing indisponibles.'},503);
 const paris=maintenantParis(),rang=r.jours_semaine.indexOf(paris.jour);
 if(!r.actif)return bilan({agi:false,raison:'Agent en pause.'});
 const {data:articleInitial,error:lecture}=await db.from('publications').select(CHAMPS).eq('marketing_jour',paris.date).maybeSingle();
 let article=articleInitial;
 if(lecture)return bilan({erreur:'Impossible de vérifier les publications existantes.'},503);
 if(!article&&rang<0)return bilan({agi:false,raison:'Jour sans publication.'});
 if(!article){
  let sujet=sujetMarketing(paris.objet,rang),source:string|null=null;
  // Une des deux prises de parole peut relayer une actualité récente étudiée.
  if(rang===0){
   const {data:infos,error}=await db.from('regulatory_watch').select('id,titre,source_url,source_nom,publie_source_le').not('analyse_le','is',null).neq('statut','ecarte').gte('publie_source_le',new Date(Date.now()-30*86400000).toISOString()).order('publie_source_le',{ascending:false}).limit(10);
   if(error)return bilan({erreur:'Les sources de veille ne peuvent pas être vérifiées.'},503);
   if(infos?.length){
    const utilises=await db.from('publications').select('veille_source_id').in('veille_source_id',infos.map(i=>i.id));
    if(utilises.error)return bilan({erreur:'L’historique des sujets est indisponible.'},503);
    const info=infos.find(i=>!utilises.data?.some(p=>p.veille_source_id===i.id));
    if(info)try{await lireSourceEtude(info.source_url);sujet=sujetDeVeille(info);source=info.id;}catch{return bilan({erreur:'La source officielle doit être vérifiée avant sa diffusion.'},503);}
   }
  }
  const creation=await db.from('publications').insert({marketing_jour:paris.date,veille_source_id:source,periode:`marketing-auto-${paris.date}`,statut:'brouillon',titre:sujet.titre,slug:`${paris.date}-${sujet.cle}`,chapo:sujet.chapo,corps:sujet.corps,sources:[`audience:${sujet.audience}`,source?'veille-officielle-gerimmo':'contenu-editorial-gerimmo'],seo_description:sujet.chapo.slice(0,160),facebook_texte:sujet.facebook,publie_le:null}).select(CHAMPS).single();
  if(creation.error||!creation.data)return bilan({erreur:'La préparation n’a pas été enregistrée. Aucun envoi effectué.'},503);
  article=creation.data;
 }
 if(article.facebook_post_id)return bilan({agi:false,raison:'Déjà publié sur Facebook.',article:article.id});
 if(!['brouillon','planifiee','publiee'].includes(article.statut))return bilan({agi:false,raison:'Article retiré de la diffusion.',article:article.id});
 if(article.facebook_envoi_demarre_le)return bilan({erreur:'Un envoi a déjà été engagé. Vérifiez Facebook avant toute nouvelle tentative.',article:article.id},503);
 const campagne=await db.from('marketing_campagnes').upsert({publication_id:article.id,nom:article.titre.slice(0,160),description:article.facebook_texte,canal:'facebook',nature:'organique',objectif:'notoriete',statut:'idee',publication_prevue_le:null,budget_cents:0},{onConflict:'publication_id'});
 if(campagne.error)return bilan({erreur:'La fiche de suivi n’a pas pu être préparée.',article:article.id},503);
 if(!article.image_empreinte){
  let reprise=false;
  if(visuelReprenable(article)){
   const remise=await db.from('publications').update({image_essais:0,image_en_cours_le:null}).eq('id',article.id).eq('image_essais',article.image_essais).select(CHAMPS).maybeSingle();
   if(remise.data){article=remise.data;reprise=true;}
  }
  const reservation=await db.rpc('reserver_visuel_marketing',{p_id:article.id});
  if(reservation.error||reservation.data!==true)return bilan({erreur:article.image_essais>=2?'Les deux essais de visuel sont épuisés ; la mission réessaiera d’elle-même après une heure. Aucun post sans image nouvelle.':'Le visuel est en préparation. Aucun post sans image nouvelle.',article:article.id,essais:article.image_essais,reprise},503);
  try{
   const apresReservation=await db.from('publications').select(CHAMPS).eq('id',article.id).single();
   if(apresReservation.error||!apresReservation.data||!['brouillon','planifiee'].includes(apresReservation.data.statut))throw new Error('Le sujet a changé.');
   article=apresReservation.data;
   const visuel=await creerVisuelMarketing(article.id,article.titre);
   const chemin=`${article.id}/${visuel.empreinte}.jpg`;
   const depot=await db.storage.from('marketing-visuels').upload(chemin,visuel.octets,{contentType:'image/jpeg',upsert:false,cacheControl:'31536000'});
   if(depot.error)throw new Error('Le visuel n’a pas pu être conservé.');
   const url=db.storage.from('marketing-visuels').getPublicUrl(chemin).data.publicUrl;
   if(!url.startsWith('https://'))throw new Error('Le visuel doit disposer d’une adresse publique sécurisée.');
   const sauvegarde=await db.from('publications').update({facebook_image_url:url,image_empreinte:visuel.empreinte,image_en_cours_le:null,facebook_erreur:null}).eq('id',article.id).eq('updated_at',article.updated_at).select(CHAMPS).maybeSingle();
   // Refuse une modification du sujet intervenue pendant la génération.
   if(sauvegarde.error||!sauvegarde.data)throw new Error('Le sujet a changé ou le visuel existe déjà. La diffusion attend une vérification.');
   article=sauvegarde.data;
  }catch(e){const message=e instanceof Error?e.message:'Le visuel doit être repris.';await db.from('publications').update({image_en_cours_le:null,facebook_erreur:message}).eq('id',article.id);return bilan({erreur:message,article:article.id,essais:article.image_essais,reprise},503);}
 }
 if(!r.publication_automatique||r.diffusion_version!==1)return bilan({agi:true,preparees:1,accord_requis:true,facebook:false,article:article.id});
 // Relit l'autorisation dans la base : une pause durant la génération est respectée.
 const parution=await db.rpc('publier_article_automatique',{p_id:article.id});
 if(parution.error)return bilan({erreur:'L’article ne satisfait pas les contrôles de publication.',article:article.id},503);
 if(parution.data!==true)return bilan({agi:false,raison:'La diffusion a été suspendue.',article:article.id});
 const reservation=await db.rpc('reserver_diffusion_facebook',{p_id:article.id,p_automatique:true});
 if(reservation.error)return bilan({erreur:'La diffusion n’a pas pu être réservée.',article:article.id},503);
 if(reservation.data!==true)return bilan({agi:false,raison:'Diffusion déjà engagée ou suspendue.',article:article.id});
 try{
  const resultat=await envoyerSurFacebook({titre:article.titre,chapo:article.chapo,slug:article.slug,facebookTexte:article.facebook_texte,facebookImageUrl:article.facebook_image_url});
  const trace=await db.from('publications').update({facebook_post_id:resultat.post_id,facebook_publie_le:new Date().toISOString(),facebook_erreur:null}).eq('id',article.id);
  if(trace.error)return bilan({erreur:'Facebook a répondu, mais la confirmation n’a pas pu être conservée. Ne pas renvoyer.',article:article.id},503);
  const suivi=await db.from('marketing_campagnes').update({statut:'terminee',fin_le:new Date().toISOString()}).eq('publication_id',article.id);
  return bilan({agi:true,publiees:1,facebook:true,article:article.id,...(suivi.error?{erreur:'Post publié, suivi de campagne à reprendre.'}:{})},suivi.error?503:200);
 }catch{await db.from('publications').update({facebook_erreur:'La confirmation Facebook manque. Vérifiez la Page avant de renvoyer pour éviter un doublon.'}).eq('id',article.id);return bilan({erreur:'La confirmation Facebook manque. Aucun nouvel envoi automatique.',article:article.id},503);}
}
