/**
 * La mission marketing en deux temps (06/10/2026) : diffusion de ce qui est
 * échu, préparation de ce que la base dit due. La base est simulée : ses
 * fonctions rendent ce que les vraies rendent ; leurs règles ont leur propre
 * test (marketing-veto.test.ts). Ce fichier vérifie l'orchestration : ordre
 * des appels, réservations respectées, aucun envoi sans réservation, aucun
 * post sans visuel, veille filtrée et rédigée depuis la source, alerte au
 * superviseur, jeton de pg_cron accepté.
 */
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {GET,maintenantParis} from '@/app/api/cron/marketing/route';
const mocks=vi.hoisted(()=>({client:vi.fn(),facebook:vi.fn(),image:vi.fn(),source:vi.fn(),redaction:vi.fn(),email:vi.fn()}));
vi.mock('@/lib/supabase/service',()=>({clientDeService:mocks.client}));
vi.mock('@/lib/facebook',()=>({envoyerSurFacebook:mocks.facebook}));
vi.mock('@/lib/visuel-marketing',()=>({creerVisuelMarketing:mocks.image}));
vi.mock('@/lib/analyse-veille',()=>({lireSourceEtude:mocks.source}));
vi.mock('@/lib/redaction-veille',()=>({redigerArticleVeille:mocks.redaction}));
vi.mock('@/lib/email',()=>({envoyerEmail:mocks.email}));
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('CRON_SECRET','test-secret');vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-08T16:05:00Z'));mocks.facebook.mockResolvedValue({post_id:'page_post'});mocks.image.mockResolvedValue({octets:Buffer.from('image de recette'),empreinte:'a'.repeat(64)});mocks.source.mockResolvedValue('Texte officiel de recette');mocks.email.mockResolvedValue({id:'mail'});
 mocks.redaction.mockResolvedValue({cle:'veille-source',audience:'particuliers',titre:'Trêve hivernale : ce qui change',chapo:'Chapo rédigé.',corps:'## Ce qui change\n\nTexte.',facebook:'Texte Facebook rédigé.'});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});

type Options={actif?:boolean;auto?:boolean;validation?:boolean;echus?:Record<string,unknown>[];cible?:{jour:string;rang:number;parution:string;rattrapage:boolean}|null;existant?:Record<string,unknown>|null;source?:boolean;titreSource?:string;publicsSource?:string[];jetonDb?:string;erreurCampagne?:boolean;parutionRefusee?:boolean;reservationRefusee?:boolean};
function contexte(o:Options={}){
 const regle={actif:o.actif??true,publication_automatique:o.auto??true,diffusion_version:1,publicite_active:true,jours_semaine:[2,5],heure_paris:9,heure_preparation_paris:18,validation_obligatoire:o.validation??false,budget_mensuel_cents:1000,veille_mots_inclus:['logement','trêve hivernale','loyer'],veille_mots_exclus:['décarbonation']};
 const articles=new Map<string,Record<string,unknown>>();
 for(const e of o.echus??[])articles.set(e.id as string,{facebook_texte:'fb',facebook_image_url:'https://stockage.test/a.jpg',slug:'slug',chapo:null,statut:'programmee',facebook_post_id:null,facebook_envoi_demarre_le:null,...e});
 if(o.existant)articles.set(o.existant.id as string,o.existant);
 const insertions:Record<string,unknown>[]=[],modifications:Record<string,unknown>[]=[],rpcs:[string,unknown][]=[];
 const rpc=vi.fn(async(n:string,args?:Record<string,unknown>)=>{rpcs.push([n,args]);
  switch(n){
   case 'log_tech':return {data:null,error:null};
   case 'jeton_declencheur_marketing':return {data:o.jetonDb??'b'.repeat(64),error:null};
   case 'publications_marketing_echues':return {data:(o.echus??[]).map(e=>e.id),error:null};
   case 'cible_preparation_marketing':return {data:o.cible===undefined?[]:o.cible?[o.cible]:[],error:null};
   case 'publier_article_automatique':{const a=articles.get(args?.p_id as string);if(o.parutionRefusee||!a)return {data:false,error:null};a.statut='publiee';return {data:true,error:null};}
   case 'reserver_diffusion_facebook':{const a=articles.get(args?.p_id as string);if(o.reservationRefusee||!a||a.facebook_envoi_demarre_le)return {data:false,error:null};a.facebook_envoi_demarre_le='now';return {data:true,error:null};}
   case 'reserver_visuel_marketing':{const a=articles.get(args?.p_id as string);if(!a||(a.image_essais as number)>=2)return {data:false,error:null};a.image_essais=(a.image_essais as number)+1;return {data:true,error:null};}
   case 'programmer_publication_marketing':{const a=articles.get(args?.p_id as string);if(!a||!a.image_empreinte)return {data:false,error:null};a.statut='programmee';a.programmee_pour=args?.p_pour;return {data:true,error:null};}
   case 'email_superviseur_permanent':return {data:'superviseur@test.local',error:null};
   default:return {data:null,error:{message:`rpc inconnue ${n}`}};
  }});
 const from=vi.fn((table:string)=>{
  let filtreId:string|null=null,filtreJour:string|null=null,mutation=false,valeurs:Record<string,unknown>|null=null;
  const lire=()=>{
   if(table==='marketing_reglages')return {data:regle,error:null};
   if(table==='regulatory_watch')return {data:o.source?[{id:'source',titre:o.titreSource??'Trêve hivernale 2026-2027 : ce que vous devez savoir',source_nom:'Service Public',source_url:'https://www.service-public.gouv.fr/particuliers/actualites/A1',publie_source_le:'2026-10-02',etude:{resume:'Les expulsions sont suspendues.',publics:o.publicsSource??['bailleur','agence','locataire']}}]:[],error:null};
   if(table==='marketing_campagnes')return {data:null,error:o.erreurCampagne?{message:'indisponible'}:null};
   if(table==='publications'){
    if(mutation){if(filtreId&&valeurs){const a=articles.get(filtreId);if(a)Object.assign(a,valeurs);return {data:a?{...a}:null,error:null};}return {data:null,error:null};}
    if(filtreId)return {data:articles.get(filtreId)?{...articles.get(filtreId)}:null,error:null};
    if(filtreJour){const a=[...articles.values()].find(x=>x.marketing_jour===filtreJour);return {data:a?{...a}:null,error:null};}
    return {data:[],error:null};
   }
   return {data:null,error:null};
  };
  const q={select:vi.fn(()=>q),eq:vi.fn((col:string,v:string)=>{if(col==='id')filtreId=v;if(col==='marketing_jour')filtreJour=v;return q;}),not:vi.fn(()=>q),neq:vi.fn(()=>q),gte:vi.fn(()=>q),order:vi.fn(()=>q),limit:vi.fn(async()=>lire()),in:vi.fn(async()=>({data:[],error:null})),single:vi.fn(async()=>lire()),maybeSingle:vi.fn(async()=>lire()),
   insert:vi.fn((v:Record<string,unknown>)=>{insertions.push(v);const a={...v,id:'nouveau',updated_at:'date',image_empreinte:null,image_essais:0,image_en_cours_le:null,facebook_post_id:null,facebook_envoi_demarre_le:null};articles.set('nouveau',a);filtreId='nouveau';return q;}),
   update:vi.fn((v:Record<string,unknown>)=>{modifications.push(v);valeurs=v;mutation=true;return q;}),upsert:vi.fn(()=>q),
   then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(mutation?lire():lire()).then(resolve)};
  return q;
 });
 const bucket={upload:vi.fn(async()=>({error:null})),getPublicUrl:()=>({data:{publicUrl:'https://stockage.test/unique.jpg'}})};
 mocks.client.mockReturnValue({from,rpc,storage:{from:()=>bucket}});
 return {insertions,modifications,rpc,rpcs,articles,bucket};
}
const requete=(jeton='test-secret')=>new Request('https://gerimmo.test/api/cron/marketing',{headers:{authorization:`Bearer ${jeton}`}});
const CIBLE={jour:'2026-10-09',rang:1,parution:'2026-10-09T07:00:00.000Z',rattrapage:false};

describe('mission marketing : diffusion de l’échu',()=>{
 it('publie puis envoie sur Facebook un post programmé échu, dans cet ordre, après réservation',async()=>{
  const c=contexte({echus:[{id:'p1',titre:'Un post'}]});
  const r=await GET(requete());expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({agi:true,publiees:1,facebook:true,diffusees:['p1']});
  const noms=c.rpcs.map(([n])=>n).filter(n=>n!=='log_tech');
  expect(noms.indexOf('publier_article_automatique')).toBeLessThan(noms.indexOf('reserver_diffusion_facebook'));
  expect(mocks.facebook).toHaveBeenCalledTimes(1);
  expect(c.modifications.some(m=>m.facebook_post_id==='page_post')).toBe(true);
 });
 it('n’envoie rien quand la base refuse la parution (validation obligatoire, pause, veille écartée)',async()=>{
  contexte({echus:[{id:'p1',titre:'Un post'}],parutionRefusee:true});
  const r=await GET(requete());expect(await r.json()).toMatchObject({publiees:0,en_attente:['p1']});expect(mocks.facebook).not.toHaveBeenCalled();
 });
 it('paru sur le site mais Facebook non réservé (plafond) : pas d’envoi, bilan en erreur',async()=>{
  contexte({echus:[{id:'p1',titre:'Un post'}],reservationRefusee:true});
  const r=await GET(requete());expect(r.status).toBe(503);expect(mocks.facebook).not.toHaveBeenCalled();
 });
 it('un envoi déjà engagé n’est jamais renvoyé ; une réponse perdue laisse une alerte',async()=>{
  contexte({echus:[{id:'p1',titre:'Un post',facebook_envoi_demarre_le:'2026-10-08'}]});
  expect((await GET(requete())).status).toBe(503);expect(mocks.facebook).not.toHaveBeenCalled();
  const c=contexte({echus:[{id:'p2',titre:'Un autre'}]});mocks.facebook.mockRejectedValueOnce(new Error('Délai dépassé'));
  expect((await GET(requete())).status).toBe(503);expect(c.modifications.some(m=>typeof m.facebook_erreur==='string'&&m.facebook_erreur.includes('confirmation Facebook'))).toBe(true);
 });
});

describe('mission marketing : préparation de la veille',()=>{
 it('rédige, illustre, programme à l’heure de Paris et alerte le superviseur, sans publier',async()=>{
  const c=contexte({cible:CIBLE});
  const r=await GET(requete());expect(r.status).toBe(200);
  const bilan=await r.json();expect(bilan.preparation).toMatchObject({agi:true,preparees:1,parution:CIBLE.parution,alerte:true});
  expect(c.insertions[0]).toMatchObject({marketing_jour:'2026-10-09',statut:'brouillon',periode:'marketing-auto-2026-10-09'});
  expect(mocks.image).toHaveBeenCalledTimes(1);
  expect(c.rpcs.find(([n])=>n==='programmer_publication_marketing')?.[1]).toMatchObject({p_pour:CIBLE.parution});
  expect(mocks.email).toHaveBeenCalledWith(expect.objectContaining({to:'superviseur@test.local',subject:expect.stringContaining('À relire')}));
  expect(mocks.facebook).not.toHaveBeenCalled();expect(c.rpcs.some(([n])=>n==='publier_article_automatique')).toBe(false);
 });
 it('le mardi (rang 0), relaie une veille pertinente rédigée depuis la page officielle',async()=>{
  const c=contexte({cible:{...CIBLE,rang:0},source:true});
  await GET(requete());
  expect(mocks.source).toHaveBeenCalledWith('https://www.service-public.gouv.fr/particuliers/actualites/A1');
  expect(mocks.redaction).toHaveBeenCalledTimes(1);
  expect(c.insertions[0]).toMatchObject({veille_source_id:'source',titre:'Trêve hivernale : ce qui change',facebook_texte:'Texte Facebook rédigé.'});
 });
 it('écarte une veille hors sujet (29/09) ou réservée aux artisans, et bascule sur l’éditorial',async()=>{
  let c=contexte({cible:{...CIBLE,rang:0},source:true,titreSource:'Amorcer un plan de décarbonation : un guide national pour les entreprises'});
  const r=await GET(requete());expect(c.insertions[0].veille_source_id).toBeNull();expect((await r.json()).preparation.ecartes[0]).toContain('décarbonation');
  c=contexte({cible:{...CIBLE,rang:0},source:true,publicsSource:['artisan']});
  await GET(requete());expect(c.insertions[0].veille_source_id).toBeNull();expect(mocks.redaction).not.toHaveBeenCalled();
 });
 it('source inaccessible ou rédaction rejetée : pas de veille ce jour-là, sujet éditorial',async()=>{
  mocks.source.mockRejectedValueOnce(new Error('Source indisponible.'));
  let c=contexte({cible:{...CIBLE,rang:0},source:true});await GET(requete());expect(c.insertions[0].veille_source_id).toBeNull();
  mocks.redaction.mockRejectedValueOnce(new Error('Citation-preuve introuvable dans la source : article rejeté.'));
  c=contexte({cible:{...CIBLE,rang:0},source:true});const r=await GET(requete());expect(c.insertions[0].veille_source_id).toBeNull();expect((await r.json()).preparation.ecartes[0]).toContain('Citation-preuve');
 });
 it('aucun post sans image nouvelle : image refusée = rien de programmé, bilan en erreur',async()=>{
  const c=contexte({cible:CIBLE});mocks.image.mockRejectedValueOnce(new Error('Image indisponible'));
  expect((await GET(requete())).status).toBe(503);expect(c.rpcs.some(([n])=>n==='programmer_publication_marketing')).toBe(false);expect(mocks.email).not.toHaveBeenCalled();
 });
 it('reprend un brouillon de la veille resté sans visuel plutôt que d’en créer un second',async()=>{
  const c=contexte({cible:CIBLE,existant:{id:'brouillon',titre:'Déjà rédigé',statut:'brouillon',marketing_jour:'2026-10-09',updated_at:'d',image_empreinte:null,image_essais:0,image_en_cours_le:null,facebook_texte:'fb',chapo:null,veille_source_id:null}});
  await GET(requete());expect(c.insertions).toHaveLength(0);expect(mocks.image).toHaveBeenCalledTimes(1);expect(c.rpcs.find(([n])=>n==='programmer_publication_marketing')?.[1]).toMatchObject({p_id:'brouillon'});
 });
 it('une fiche de suivi indisponible arrête la préparation avant l’image',async()=>{
  contexte({cible:CIBLE,erreurCampagne:true});expect((await GET(requete())).status).toBe(503);expect(mocks.image).not.toHaveBeenCalled();
 });
});

describe('mission marketing : garde et horloge',()=>{
 it('accepte CRON_SECRET et le jeton généré en base, refuse le reste',async()=>{
  contexte();expect((await GET(requete())).status).toBe(200);
  contexte();expect((await GET(requete('b'.repeat(64)))).status).toBe(200);
  contexte();expect((await GET(requete('c'.repeat(64)))).status).toBe(401);
  contexte();expect((await GET(new Request('https://gerimmo.test/api/cron/marketing'))).status).toBe(401);
 });
 it('agent en pause : rien ne part, rien ne se prépare',async()=>{
  contexte({actif:false,echus:[{id:'p1',titre:'x'}],cible:CIBLE});expect(await (await GET(requete())).json()).toMatchObject({agi:false,raison:'Agent en pause.'});expect(mocks.facebook).not.toHaveBeenCalled();expect(mocks.image).not.toHaveBeenCalled();
 });
 it('rien d’échu, rien à préparer : un passage calme',async()=>{
  contexte();expect(await (await GET(requete())).json()).toMatchObject({agi:false,raison:'Rien d’échu, rien à préparer.'});
 });
 it('maintenantParis garde la bonne date autour du changement d’heure',()=>{
  expect(maintenantParis(new Date('2026-10-24T22:30:00Z')).date).toBe('2026-10-25');
  expect(maintenantParis(new Date('2026-10-25T22:30:00Z')).date).toBe('2026-10-25');
  expect(maintenantParis(new Date('2026-10-26T06:30:00Z')).jour).toBe(1);
 });
});
