import { afterEach, describe, expect, it, vi } from "vitest";
import { ajouterPagesSignature, configurationSignatureBail, empreinteSignatureBail, partiesSignatureBail, telephoneSignature } from "@/lib/signature-bail";
import { activerDemandeYoutrust, annulerDemandeYoutrust, preparerCircuitYoutrust, telechargerDocumentSigneYoutrust } from "@/lib/youtrust";
import type { ContexteBail, PersonneDocument } from "@/lib/documents/modeles/communs";
import type { DocumentAssemble } from "@/lib/documents/gabarit";

const personne=(id:string):PersonneDocument=>({id,prenom:"Prénom",nom:id,email:`${id}@example.test`,telephone:"06 12 34 56 78",qualite:"personne physique",date_naissance:null,commune_naissance:null,address_line1:null,postal_code:null,city:null});
const contexte=()=>({organisation:{type:"proprietaire_direct"},locataires:[personne("locataire"),personne("colocataire")],garants:[{...personne("garant"),garant_de:"locataire"}],bailleurs:[{...personne("bailleur"),quote_part:100}]} as ContexteBail);
const config={cleApi:"test-secret",environnement:"sandbox" as const,baseUrl:"https://signature.example.test/v3"};
const signataires=[{prenom:"Alice",nom:"Test",email:"alice@example.test",telephone:"+33612345678"},{prenom:"Benoît",nom:"Test",email:"benoit@example.test",telephone:"+33698765432"}];
const parametres=()=>({config,pdf:new TextEncoder().encode("%PDF-test"),nomFichier:"contrat.pdf",titre:"Bail fictif",referenceExterne:"circuit-test",expiration:"2026-11-18",signataires,demandeCreee:vi.fn(async()=>{})});
afterEach(()=>vi.unstubAllGlobals());

describe("parties du bail à signer",()=>{
 it("préserve les colocataires et les garants et place tous les propriétaires en dernier",()=>{
  const ctx=contexte();ctx.bailleurs.push({...personne("indivisaire"),quote_part:50});
  const res=partiesSignatureBail(ctx);
  expect(res.manquants).toEqual([]);expect(res.signataires.map(s=>s.qualite)).toEqual(["Locataire","Colocataire","Garant","Propriétaire","Propriétaire"]);
 });
 it("bloque une identité incomplète, sans téléphone ou avec un e-mail invalide",()=>{
  const ctx=contexte();Object.assign(ctx.locataires[0],{prenom:null,telephone:null,email:"invalide"});
  expect(partiesSignatureBail(ctx).manquants).toHaveLength(3);
 });
 it("ne fabrique pas un signataire pour une SCI ni pour un mandat d’agence",()=>{
  const ctx=contexte();ctx.organisation.type="agence";ctx.bailleurs[0].qualite="SCI";
  expect(partiesSignatureBail(ctx).manquants.join(" ")).toMatch(/mandataire.*représentant/);
 });
 it("refuse qu’une même personne apparaisse comme locataire et bailleur",()=>{
  const ctx=contexte();ctx.bailleurs=[{...ctx.locataires[0],quote_part:100}];
  expect(partiesSignatureBail(ctx).manquants.join()).toContain("plusieurs rôles");
 });
 it.each([["06 12 34 56 78","+33612345678"],["0032 470 12 34 56","+32470123456"],["+44 (7700) 900123","+447700900123"],["1234",""],["06abc12345678",""]])("normalise ou refuse %s",(s,n)=>expect(telephoneSignature(s)).toBe(n));
});

describe("accord explicite et isolation des essais",()=>{
 const env={SIGNATURE_BAIL_PRESTATAIRE:"youtrust",YOUTRUST_API_KEY:"test",YOUTRUST_WEBHOOK_SECRET:"webhook",YOUTRUST_BAIL_ACTIF:"true",YOUTRUST_ENV:"sandbox",NEXT_PUBLIC_SUPABASE_URL:"http://localhost:54325"};
 it("refuse d’activer par la seule présence d’une clé",()=>expect(configurationSignatureBail({...env,YOUTRUST_BAIL_ACTIF:undefined})).toBeNull());
 it("exige le secret de retour",()=>expect(configurationSignatureBail({...env,YOUTRUST_WEBHOOK_SECRET:""})).toBeNull());
 it("autorise une sandbox locale explicitement activée",()=>expect(configurationSignatureBail(env)?.environnement).toBe("sandbox"));
 it.each([{VERCEL:"1"},{NEXT_PUBLIC_SUPABASE_URL:"https://rddlxunppddzpsaatdaz.supabase.co"},{NEXT_PUBLIC_SUPABASE_URL:"https://localhost.evil.test"}])("refuse une sandbox sur un environnement déployé ou distant (%j)",s=>expect(configurationSignatureBail({...env,...s})).toBeNull());
});

describe("version du PDF",()=>{
 it("ignore seulement le changement de date d’édition, jamais une date du bail",()=>{
  const a='<div>Établi le <span class="v">18/10/2026</span></div><p>Entrée le 01/11/2026</p>';
  expect(empreinteSignatureBail(a,[])).toBe(empreinteSignatureBail(a.replace("18/10/2026","19/10/2026"),[]));
  expect(empreinteSignatureBail(a,[])).not.toBe(empreinteSignatureBail(a.replace("01/11/2026","02/11/2026"),[]));
 });
 it("crée des emplacements distincts, échappe les noms et lie les annexes par empreinte",()=>{
  const doc={html:"<body>Contrat</body>",reference:"BAIL-TEST"} as DocumentAssemble;
  const parties=partiesSignatureBail(contexte()).signataires;parties[0].nom="<script>alert(1)</script>";
  const rendu=ajouterPagesSignature(doc,parties,[{id:"a",titre:"DPE",storage_path:"org/dpe.pdf",empreinte:"abc"}]).html;
  expect(rendu.match(/\{\{s\d+\|signature\|190\|80\}\}/g)).toHaveLength(4);
  expect(rendu).toContain("{{s4|signature|190|80}}");expect(rendu).not.toContain("<script>");expect(rendu).toContain("SHA-256 : abc");
 });
});

describe("circuit prestataire séquentiel",()=>{
 function fauxApi(reponses:unknown[]) {
  const fetch=vi.fn(async()=>new Response(JSON.stringify(reponses.shift()),{status:201,headers:{"content-type":"application/json"}}));
  vi.stubGlobal("fetch",fetch);return fetch;
 }
 it("persiste la demande avant l’upload, ajoute les annexes et n’active rien pendant la préparation",async()=>{
  const fetch=fauxApi([{id:"req"},{id:"doc",total_anchors:2},{id:"annexe"},{id:"s1"},{id:"s2"}]);
  const p=parametres();p.demandeCreee.mockImplementation(async()=>{expect(fetch).toHaveBeenCalledTimes(1);});
  const res=await preparerCircuitYoutrust({...p,annexes:[{pdf:new TextEncoder().encode("%PDF-annexe"),nomFichier:"dpe.pdf"}]});
  expect(res.signataireIds).toEqual(["s1","s2"]);
  const appels=fetch.mock.calls as unknown as [string,RequestInit][];
  expect(JSON.parse(appels[0][1].body as string)).toMatchObject({ordered_signers:true,expiration_date:"2026-11-18",smart_anchors_resolution:"on_activation"});
  expect((appels[2][1].body as FormData).get("nature")).toBe("attachment");
  expect(appels.some(([url])=>url.endsWith("/activate"))).toBe(false);
  expect(JSON.parse(appels[3][1].body as string)).toMatchObject({signature_authentication_mode:"otp_sms"});
 });
 it("n’upload rien si la référence ne peut pas être enregistrée",async()=>{
  const fetch=fauxApi([{id:"req"}]);const p=parametres();p.demandeCreee.mockRejectedValue(new Error("base indisponible"));
  await expect(preparerCircuitYoutrust(p)).rejects.toThrow("base indisponible");expect(fetch).toHaveBeenCalledTimes(1);
 });
 it("bloque un PDF dont les emplacements ne correspondent pas aux parties",async()=>{
  const fetch=fauxApi([{id:"req"},{id:"doc",total_anchors:1}]);
  await expect(preparerCircuitYoutrust(parametres())).rejects.toThrow("emplacements");expect(fetch).toHaveBeenCalledTimes(2);
 });
 it("refuse le SMS absent au lieu de diminuer silencieusement la vérification",async()=>{
  const fetch=fauxApi([]);await expect(preparerCircuitYoutrust({...parametres(),signataires:[{...signataires[0],telephone:null},signataires[1]]})).rejects.toThrow("téléphone");expect(fetch).not.toHaveBeenCalled();
 });
 it("active seulement sur appel distinct et annule avec le motif exigé par l’API",async()=>{
  const fetch=fauxApi([{id:"req",status:"ongoing"},{id:"req",status:"canceled"}]);
  await activerDemandeYoutrust(config,"req");await annulerDemandeYoutrust(config,"req");
  const appels=fetch.mock.calls as unknown as [string,RequestInit][];
  expect(appels[0][0]).toMatch(/\/activate$/);expect(JSON.parse(appels[1][1].body as string)).toEqual({reason:"contractualization_aborted"});
 });
 it("n’archive pas une page HTML déguisée en PDF",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response("<html>error</html>")));
  await expect(telechargerDocumentSigneYoutrust(config,"req","doc")).rejects.toThrow("PDF");
 });
 it("borne les téléchargements même sans Content-Length",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>new Response(new Uint8Array(10_485_761))));
  await expect(telechargerDocumentSigneYoutrust(config,"req","doc")).rejects.toThrow("volumineuse");
 });
});
