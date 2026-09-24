import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {GET,maintenantParis} from '@/app/api/cron/marketing/route';
const mocks=vi.hoisted(()=>({client:vi.fn(),facebook:vi.fn(),image:vi.fn(),source:vi.fn()}));
vi.mock('@/lib/supabase/service',()=>({clientDeService:mocks.client}));
vi.mock('@/lib/facebook',()=>({envoyerSurFacebook:mocks.facebook}));
vi.mock('@/lib/visuel-marketing',()=>({creerVisuelMarketing:mocks.image}));
vi.mock('@/lib/analyse-veille',()=>({lireSourceEtude:mocks.source}));
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv('CRON_SECRET','test-secret');vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-22T08:00:00Z'));mocks.facebook.mockResolvedValue({post_id:'page_post'});mocks.image.mockResolvedValue({octets:Buffer.from('image de recette'),empreinte:'a'.repeat(64)});mocks.source.mockResolvedValue('Texte officiel de recette');});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
function contexte(options:{actif?:boolean;auto?:boolean;version?:number;envoyee?:boolean;engagee?:boolean;pauseDurantImage?:boolean;imageDupliquee?:boolean;source?:boolean;erreurCampagne?:boolean}={}){
 const regle={actif:options.actif??true,publication_automatique:options.auto??true,diffusion_version:options.version??1,publicite_active:true,jours_semaine:[2,5],heure_paris:10,budget_mensuel_cents:1000};
 let article:Record<string,unknown>|null=options.envoyee||options.engagee?{id:'article',statut:'publiee',facebook_post_id:options.envoyee?'page_post':null,facebook_envoi_demarre_le:options.engagee?'2026-09-22':null}:null;
 const insertions:Record<string,unknown>[]=[],modifications:Record<string,unknown>[]=[];
 const rpc=vi.fn(async(n:string)=>({data:n==='log_tech'?null:!(n==='publier_article_automatique'&&options.pauseDurantImage),error:null}));
 const from=vi.fn((table:string)=>{
  let mutation=false,sauvegarde=false;
  const resultat=()=>{if(table==='marketing_reglages')return {data:regle,error:null};if(table==='regulatory_watch')return {data:options.source?[{id:'source',titre:'Diagnostics : information officielle',source_nom:'Service Public',source_url:'https://www.service-public.gouv.fr/particuliers/actualites/A1',publie_source_le:'2026-09-20'}]:[],error:null};if(table==='marketing_campagnes')return {data:null,error:options.erreurCampagne?{message:'indisponible'}:null};return {data:sauvegarde&&options.imageDupliquee?null:article,error:sauvegarde&&options.imageDupliquee?{code:'23505'}:null};};
  const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),not:vi.fn(()=>q),neq:vi.fn(()=>q),gte:vi.fn(()=>q),order:vi.fn(()=>q),limit:vi.fn(async()=>resultat()),in:vi.fn(async()=>({data:[],error:null})),single:vi.fn(async()=>resultat()),maybeSingle:vi.fn(async()=>resultat()),insert:vi.fn((valeurs:Record<string,unknown>)=>{insertions.push(valeurs);article={...valeurs,id:'article',updated_at:'date',image_empreinte:null,image_essais:0};mutation=true;return q;}),update:vi.fn((valeurs:Record<string,unknown>)=>{modifications.push(valeurs);sauvegarde='image_empreinte'in valeurs;article={...article,...valeurs};mutation=true;return q;}),upsert:vi.fn(()=>q),then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(mutation?{error:null}:resultat()).then(resolve)};return q;
 });
 const bucket={upload:vi.fn(async()=>({error:null})),getPublicUrl:()=>({data:{publicUrl:'https://stockage.test/unique.jpg'}})};
 mocks.client.mockReturnValue({from,rpc,storage:{from:()=>bucket}});return {insertions,modifications,rpc,bucket};
}
const requete=()=>new Request('https://gerimmo.test/api/cron/marketing',{headers:{authorization:'Bearer test-secret'}});
describe('marketing automatique contrôlable et illustré',()=>{
 it('crée un visuel propre au sujet et publie par Gerimmo après les réservations',async()=>{const c=contexte();const r=await GET(requete());expect(r.status).toBe(200);expect(await r.json()).toMatchObject({publiees:1,facebook:true});expect(c.insertions[0]).toMatchObject({statut:'brouillon',marketing_jour:'2026-09-22'});expect(mocks.image).toHaveBeenCalledTimes(1);expect(mocks.facebook).toHaveBeenCalledWith(expect.objectContaining({facebookImageUrl:'https://stockage.test/unique.jpg'}));expect(c.rpc).toHaveBeenCalledWith('reserver_diffusion_facebook',{p_id:'article',p_automatique:true});});
 it('un ancien réglage ne suffit pas ; le mode brouillon reste disponible',async()=>{contexte({version:0});const r=await GET(requete());expect(await r.json()).toMatchObject({accord_requis:true,facebook:false});expect(mocks.facebook).not.toHaveBeenCalled();});
 it('respecte la pause initiale et celle prise pendant la création de l’image',async()=>{const c=contexte({actif:false});await GET(requete());expect(c.insertions).toHaveLength(0);expect(mocks.image).not.toHaveBeenCalled();contexte({pauseDurantImage:true});await GET(requete());expect(mocks.facebook).not.toHaveBeenCalled();});
 it('ne republie ni un post confirmé ni un envoi sans confirmation',async()=>{contexte({envoyee:true});await GET(requete());contexte({engagee:true});expect((await GET(requete())).status).toBe(503);expect(mocks.facebook).not.toHaveBeenCalled();expect(mocks.image).not.toHaveBeenCalled();});
 it('une image absente ou déjà utilisée bloque la diffusion',async()=>{contexte();mocks.image.mockRejectedValueOnce(new Error('Image indisponible'));expect((await GET(requete())).status).toBe(503);contexte({imageDupliquee:true});expect((await GET(requete())).status).toBe(503);expect(mocks.facebook).not.toHaveBeenCalled();});
 it('relaie une source de veille récente sans publier les conclusions internes',async()=>{const c=contexte({source:true});await GET(requete());expect(c.insertions[0].veille_source_id).toBe('source');expect(c.insertions[0].corps).toContain('https://www.service-public.gouv.fr/particuliers/actualites/A1');expect(mocks.source).toHaveBeenCalledTimes(1);});
 it('refuse sans secret et garde la bonne date autour du changement d’heure',async()=>{contexte();expect((await GET(new Request('https://gerimmo.test/api/cron/marketing'))).status).toBe(401);expect(mocks.client).not.toHaveBeenCalled();expect(maintenantParis(new Date('2026-10-25T23:30:00Z'))).toMatchObject({date:'2026-10-26',jour:1});});
 it('une fiche de suivi indisponible empêche l’envoi',async()=>{contexte({erreurCampagne:true});expect((await GET(requete())).status).toBe(503);expect(mocks.facebook).not.toHaveBeenCalled();});
 it('une réponse perdue conserve une alerte et ne présente pas le post comme confirmé',async()=>{const c=contexte();mocks.facebook.mockRejectedValueOnce(new Error('Délai dépassé'));expect((await GET(requete())).status).toBe(503);expect(c.modifications.some(v=>typeof v.facebook_erreur==='string'&&v.facebook_erreur.includes('confirmation'))).toBe(true);expect(c.modifications.some(v=>v.facebook_post_id)).toBe(false);});
});
