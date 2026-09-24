import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {GET} from "@/app/api/cron/marketing/route";
const mocks=vi.hoisted(()=>({client:vi.fn(),facebook:vi.fn()}));
vi.mock("@/lib/supabase/service",()=>({clientDeService:mocks.client}));
vi.mock("@/lib/facebook",()=>({envoyerSurFacebook:mocks.facebook}));
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("CRON_SECRET","test-secret");vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-22T08:00:00Z"));});
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();});
function contexte(options:{actif?:boolean;existante?:boolean;erreurLecture?:boolean;erreurCampagne?:boolean}={}) {
 const insert=vi.fn(),upsert=vi.fn().mockResolvedValue({error:options.erreurCampagne?{message:"indisponible"}:null}),rpc=vi.fn().mockResolvedValue({error:null});
 const regle={actif:options.actif??true,publication_automatique:true,publicite_active:true,jours_semaine:[2,5],heure_paris:10,budget_mensuel_cents:1000};
 const q={select:vi.fn(()=>q),eq:vi.fn(()=>q),single:vi.fn(async()=>({data:regle,error:null}))};
 const pub={select:vi.fn(()=>pub),eq:vi.fn(()=>pub),maybeSingle:vi.fn(async()=>({data:options.existante?{id:"ancien",facebook_post_id:null}:null,error:options.erreurLecture?{message:"indisponible"}:null})),insert, single:vi.fn(async()=>({data:{id:"brouillon",titre:"Une proposition",slug:"proposition"},error:null}))};
 insert.mockReturnValue(pub);
 const from=vi.fn((table:string)=>table==="marketing_reglages"?q:table==="publications"?pub:{upsert});
 mocks.client.mockReturnValue({from,rpc});
 return {from,insert,upsert};
}
const requete=()=>new Request("https://gerimmo.test/api/cron/marketing",{headers:{authorization:"Bearer test-secret"}});
describe("les publications marketing attendent l’accord du superviseur",()=>{
 it("un ancien réglage automatique ne diffuse ni article ni post",async()=>{
  const c=contexte();const r=await GET(requete());expect(r.status).toBe(200);
  expect(await r.json()).toMatchObject({preparees:1,accord_requis:true,facebook:false});
  expect(c.insert).toHaveBeenCalledWith(expect.objectContaining({statut:"brouillon",publie_le:null}));
  expect(c.upsert).toHaveBeenCalledWith(expect.objectContaining({statut:"idee",publication_prevue_le:null,budget_cents:0}),expect.anything());
  expect(mocks.facebook).not.toHaveBeenCalled();
 });
 it("une pause ne prépare rien et n’envoie rien",async()=>{const c=contexte({actif:false});await GET(requete());expect(c.insert).not.toHaveBeenCalled();expect(c.upsert).not.toHaveBeenCalled();expect(mocks.facebook).not.toHaveBeenCalled();});
 it("ne duplique pas une proposition existante",async()=>{const c=contexte({existante:true});await GET(requete());expect(c.insert).not.toHaveBeenCalled();expect(mocks.facebook).not.toHaveBeenCalled();});
 it("une lecture impossible ne vaut pas absence de brouillon",async()=>{const c=contexte({erreurLecture:true});expect((await GET(requete())).status).toBe(503);expect(c.insert).not.toHaveBeenCalled();});
 it("signale une fiche de campagne manquante sans publier le brouillon",async()=>{const c=contexte({erreurCampagne:true});expect((await GET(requete())).status).toBe(503);expect(c.insert).toHaveBeenCalledWith(expect.objectContaining({statut:"brouillon"}));expect(mocks.facebook).not.toHaveBeenCalled();});
 it("refuse sans le secret avant toute lecture",async()=>{contexte();expect((await GET(new Request("https://gerimmo.test/api/cron/marketing"))).status).toBe(401);expect(mocks.client).not.toHaveBeenCalled();});
});
