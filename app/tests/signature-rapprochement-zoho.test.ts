import {createHash} from "node:crypto";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {retrouverBrouillonZoho,telephoneZoho,rappelerDemandeZoho,lireDemandeZoho,type ConfigurationZohoSign} from "@/lib/zoho-sign";
import {rangRelanceSignature} from "@/lib/signature-suivi";
const pdf=new TextEncoder().encode("%PDF-1.4\nFictif\n%%EOF");
const hash=createHash("sha256").update(pdf).digest("hex");
const parties=[{prenom:"Personne",nom:"Fictive",email:["personne","exemple.invalid"].join("@"),telephone:"+33600000001"}];
const attendu={id:"circuit-fictif",pdf_hash:hash,annexes:[],signataires:parties};
const dossier=()=>({request_id:"123",description:"gerimmo:circuit:circuit-fictif",request_status:"draft",is_sequential:true,
 document_ids:[{document_id:"456",document_order:0,total_pages:3}],
 actions:parties.map((s,i)=>({action_id:"789",action_type:"SIGN",recipient_name:`${s.prenom} ${s.nom}`,recipient_email:s.email,signing_order:i,action_status:"NOACTION",verify_recipient:true,verification_type:"SMS",...telephoneZoho(s.telephone)}))});
const liste=(requests:unknown[],suite=false)=>({code:0,requests,page_context:{has_more_rows:suite}});
let config:ConfigurationZohoSign;
beforeEach(()=>{config={prestataire:"zoho",environnement:"sandbox",clientId:crypto.randomUUID(),clientSecret:"fictif",refreshToken:"fictif"};});
afterEach(()=>vi.unstubAllGlobals());
function api(reponses:unknown[]){
 const fetch=vi.fn(async(url:string,init?:RequestInit)=>{
  if(url.includes("/oauth/"))return Response.json({access_token:"fictif",expires_in:3600});
  const v=reponses.shift();
  if(v instanceof Error)throw v;
  if(v instanceof Uint8Array)return new Response(Uint8Array.from(v));
  expect(init?.method??"GET").toBe("GET");
  return Response.json(v);
 });vi.stubGlobal("fetch",fetch);return fetch;
}
describe("Rapprochement Zoho sans création",()=>{
 it("retrouve uniquement le brouillon exact et contrôle les octets",async()=>{
  const fetch=api([liste([dossier()]),{code:0,requests:dossier()},pdf]);
  await expect(retrouverBrouillonZoho(config,attendu)).resolves.toEqual({demandeId:"123",documentId:"456",signataireIds:["789"]});
  expect(fetch.mock.calls.filter(c=>c[1]?.method==="POST")).toHaveLength(1); // OAuth seul.
  expect(fetch.mock.calls.some(c=>/submit|remind/.test(c[0]))).toBe(false);
 });
 it("parcourt la seconde page au lieu de conclure à l'absence",async()=>{
  const premieres=Array.from({length:100},(_,i)=>({request_id:String(1000+i),description:"autre"}));
  const fetch=api([liste(premieres,true),liste([dossier()]),{code:0,requests:dossier()},pdf]);
  await retrouverBrouillonZoho(config,attendu);
  const appel=fetch.mock.calls[2][0];
  expect(JSON.parse(new URL(appel).searchParams.get("data")!).page_context.start_index).toBe(101);
 });
 it.each([
  ["absente",()=>liste([])],
  ["deux correspondances",()=>liste([dossier(),{...dossier(),request_id:"124"}])],
  ["pagination inconnue",()=>({code:0,requests:[dossier()]})],
  ["page partielle",()=>liste([dossier()],true)],
  ["refus fournisseur",()=>({code:999,requests:[dossier()],page_context:{has_more_rows:false}})],
 ])("refuse une liste %s",async(_,creer)=>{
  const fetch=api([creer()]);
  await expect(retrouverBrouillonZoho(config,attendu)).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(2);
 });
 it("ne retient pas une correspondance lorsque la limite de lecture est atteinte",async()=>{
  const pages=Array.from({length:5},(_,p)=>liste(Array.from({length:100},(_,i)=>({request_id:String(p*100+i+1),description:p===0&&i===0?dossier().description:"autre"})),true));
  const fetch=api(pages);await expect(retrouverBrouillonZoho(config,attendu)).rejects.toThrow("manuellement");expect(fetch).toHaveBeenCalledTimes(6);
 });
 it("refuse les pages qui se chevauchent",async()=>{
  const page=Array.from({length:100},(_,i)=>({request_id:String(i+1),description:"autre"}));
  api([liste(page,true),liste([page[0]])]);await expect(retrouverBrouillonZoho(config,attendu)).rejects.toThrow("changé");
 });
 it.each(["inprogress","completed","recalled","expired"])("ne rattache jamais un dossier déjà %s",async etat=>{
  api([liste([dossier()]),{code:0,requests:{...dossier(),request_status:etat}}]);
  await expect(retrouverBrouillonZoho(config,attendu)).rejects.toThrow("examinée");
 });
 it.each(["recipient_email","recipient_phonenumber","recipient_name","verification_type"])("refuse le changement de %s",async champ=>{
  const d=dossier();Object.assign(d.actions[0],{[champ]:"autre"});
  api([liste([dossier()]),{code:0,requests:d}]);await expect(retrouverBrouillonZoho(config,attendu)).rejects.toThrow("parties");
 });
 it("refuse un document modifié",async()=>{
  api([liste([dossier()]),{code:0,requests:dossier()},new TextEncoder().encode("%PDF-autre")]);
  await expect(retrouverBrouillonZoho(config,attendu)).rejects.toThrow("original");
 });
 it("contrôle aussi chaque annexe",async()=>{
  const d=dossier();d.document_ids.push({document_id:"457",document_order:1,total_pages:2});
  api([liste([d]),{code:0,requests:d},pdf,new TextEncoder().encode("%PDF-annexe modifiée")]);
  await expect(retrouverBrouillonZoho(config,{...attendu,annexes:[{empreinte:hash}]})).rejects.toThrow("original");
 });
 it("respecte l'arrêt avant la première lecture",async()=>{
  const fetch=api([]);await expect(retrouverBrouillonZoho(config,attendu,undefined,async()=>{throw Error("arrêt");})).rejects.toThrow("arrêt");expect(fetch).not.toHaveBeenCalled();
 });
});
describe("Calendrier des rappels",()=>{
 it.each([[6,null],[7,7],[20,7],[21,21],[27,21],[28,null],[29,null]])("à J+%s : %s", (jours,attendu)=>{
  const debut=new Date("2026-10-01T10:00:00Z"),maintenant=new Date(debut.getTime()+Number(jours)*86_400_000);
  expect(rangRelanceSignature(debut.toISOString(),"2026-12-01T00:00:00Z",maintenant)).toBe(attendu);
 });
 it("compte le jour de Paris lorsque UTC est encore la veille",()=>expect(rangRelanceSignature("2026-10-01T12:00:00Z","2026-11-01T00:00:00Z",new Date("2026-10-07T22:05:00Z"))).toBe(7));
 it("compte sept dates civiles malgré le changement d'heure",()=>expect(rangRelanceSignature("2026-10-19T10:00:00Z","2026-11-18T00:00:00Z",new Date("2026-10-25T23:05:00Z"))).toBe(7));
 it.each([null,"invalide"])("ignore une date d'envoi %s",date=>expect(rangRelanceSignature(date,"2026-11-01T00:00:00Z")).toBeNull());
 it("ne relance pas une demande expirée",()=>expect(rangRelanceSignature("2026-10-01T00:00:00Z","2026-10-07T00:00:00Z",new Date("2026-10-08T00:00:00Z"))).toBeNull());
});

it('relit l’arrêt après le renouvellement OAuth avant un rappel',async()=>{
 let arret=false,oauth=0;const horloge=vi.spyOn(Date,'now');let maintenant=new Date('2026-10-20T10:00:00Z').getTime();horloge.mockImplementation(()=>maintenant);
 const fetch=vi.fn(async(url:string)=>{
  if(url.includes('/oauth/')){if(++oauth===2)arret=true;return Response.json({access_token:'fictif',expires_in:61});}
  if(url.endsWith('/remind'))return Response.json({code:0});
  return Response.json({code:0,requests:{...dossier(),request_status:'inprogress'}});
 });vi.stubGlobal('fetch',fetch);
 try{
  await lireDemandeZoho(config,'123');maintenant+=2000;
  await expect(rappelerDemandeZoho(config,'123',async()=>{if(arret)throw Error('arrêt demandé');})).rejects.toThrow('arrêt demandé');
  expect(oauth).toBe(2);expect(fetch.mock.calls.some(([url])=>url.endsWith('/remind'))).toBe(false);
 }finally{horloge.mockRestore();}
});
