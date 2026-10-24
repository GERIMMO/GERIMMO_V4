import {afterEach,beforeEach,describe,it,expect,vi} from "vitest";
const m=vi.hoisted(()=>({file:vi.fn(),flux:vi.fn(),etudier:vi.fn(),sources:vi.fn(),ecritures:vi.fn(),connues:[] as {source_url:string}[]}));
vi.mock("@/lib/file-veille",()=>({lireFileVeille:m.file}));
vi.mock("@/lib/veille-reglementaire",()=>({FLUX_VEILLE:[{url:"flux1",nom:"SP"},{url:"flux2",nom:"SP2"}],chargerFluxVeille:m.flux,lireFluxVeille:(v:unknown)=>v}));
vi.mock("@/lib/analyse-veille",()=>({lireSourceEtude:m.sources,etudierVeille:m.etudier}));
vi.mock("@/lib/controle-effets",()=>({verifierAvantEffet:vi.fn(),ArretSupervision:class extends Error{}}));
vi.mock("@/lib/tache",()=>({porteurDuSecret:()=>true,consignerTache:vi.fn()}));
vi.mock("@/lib/supabase/service",()=>({clientDeService:()=>({from:()=>{
 let ajout:Record<string,unknown>[]|null=null;
 const q={select:()=>q,in:()=>q,upsert:(v:Record<string,unknown>[])=>{ajout=v;m.ecritures(v);return q;},then:(f:(v:unknown)=>unknown)=>Promise.resolve({data:ajout?ajout.map((v,i)=>({...v,id:`ajout-${i}`,analyse_le:null,analyse_tentee_le:null})):m.connues,error:null}).then(f)};return q;
},rpc:async()=>({error:null})})}));
import {traiterVeille} from "@/lib/missions-planifiees/veille";
import {preparerPostDu} from "@/lib/missions-planifiees/marketing";
const info=(i:number,titre=`DPE des logements ${i}`,analyse_le:string|null="2026-10-24")=>({id:String(i),titre,source_url:`https://www.service-public.gouv.fr/A${i}`,publie_source_le:"2026-10-24",analyse_le,analyse_tentee_le:null});
beforeEach(()=>{vi.clearAllMocks();m.file.mockResolvedValue([]);m.flux.mockResolvedValue([]);m.sources.mockResolvedValue("source");m.etudier.mockResolvedValue({analyses:[],rejets:[]});m.connues=[];});
afterEach(()=>vi.restoreAllMocks());
const lancer=()=>traiterVeille(new Request("http://localhost/veille"));
describe("la veille arrête réellement d'accumuler des propositions",()=>{
 it("une file pleine ne collecte rien et n'étudie pas les anciens hors-sujets",async()=>{
  m.file.mockResolvedValue([info(10,"AAH",null),...Array.from({length:5},(_,i)=>info(i))]);
  expect((await lancer()).status).toBe(200);
  expect(m.flux).not.toHaveBeenCalled();expect(m.ecritures).not.toHaveBeenCalled();expect(m.etudier).not.toHaveBeenCalled();
 });
 it("les deux flux partagent les deux places restantes, sans rouvrir une source déjà traitée",async()=>{
  m.file.mockResolvedValue([info(0),info(1),info(2)]);
  m.connues=[{source_url:info(3).source_url}];
  m.flux.mockResolvedValue([info(3),info(4),info(5),info(6)]);
  const r=await lancer();expect(await r.json()).toMatchObject({preparees:2,echecs:[]});
  expect(m.ecritures).toHaveBeenCalledTimes(1);
  expect(m.ecritures.mock.calls[0][0].map((i:{source_url:string})=>i.source_url)).toEqual([info(4).source_url,info(5).source_url]);
 });
 it("une panne de lecture n'est jamais traitée comme une file vide",async()=>{
  m.file.mockRejectedValue(new Error("indisponible"));
  expect((await lancer()).status).toBe(503);expect(m.flux).not.toHaveBeenCalled();expect(m.ecritures).not.toHaveBeenCalled();
 });
 it("reprend les études utiles existantes, même avec une file pleine",async()=>{
  m.file.mockResolvedValue(Array.from({length:5},(_,i)=>info(i,undefined,null)));
  await lancer();expect(m.flux).not.toHaveBeenCalled();expect(m.sources).toHaveBeenCalledTimes(3);
 });
});
describe("deux articles avant toute nouvelle rédaction ou image",()=>{
 function base(count:number|null,error:unknown=null,existant:unknown=null){
  const insert=vi.fn();const q={select:()=>q,eq:()=>q,in:()=>q,maybeSingle:async()=>({data:existant,error:null}),then:(f:(v:unknown)=>unknown)=>Promise.resolve({count,error}).then(f),insert};
  return {db:{from:vi.fn(()=>q)},insert};
 }
 it("n'ajoute rien quand deux articles attendent déjà",async()=>{
  const {db,insert}=base(2);const r=await preparerPostDu(db as never,{} as never,{jour:"2026-10-24",rang:1,parution:"2026-10-25",rattrapage:false});
  expect(r).toMatchObject({agi:false});expect(r).toHaveProperty("raison",expect.stringContaining("2 articles"));expect(insert).not.toHaveBeenCalled();
 });
 it.each([[null,null],[null,{message:"panne"}]])("n'engage rien si le compteur est inconnu",async(count,error)=>{
  const {db,insert}=base(count as null,error);const r=await preparerPostDu(db as never,{} as never,{jour:"2026-10-24",rang:1,parution:"2026-10-25",rattrapage:false});
  expect(r).toHaveProperty("erreur");expect(insert).not.toHaveBeenCalled();
 });
 it("un créneau déjà programmé reste idempotent",async()=>{
  const {db}=base(2,null,{id:"existant",statut:"programmee"});
  expect(await preparerPostDu(db as never,{} as never,{jour:"2026-10-24",rang:1,parution:"2026-10-25",rattrapage:false})).toMatchObject({agi:false,article:"existant"});
  expect(db.from).toHaveBeenCalledTimes(1);
 });
});
