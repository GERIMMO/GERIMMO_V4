import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const m=vi.hoisted(()=>({lire:vi.fn(),pdf:vi.fn(),preuve:vi.fn(),zohoLire:vi.fn(),zohoPdf:vi.fn(),zohoPreuve:vi.fn(),zohoDossier:vi.fn(),garde:vi.fn()}));
vi.mock("@/lib/zoho-sign",()=>({lireDemandeZoho:m.zohoLire,telechargerDocumentSigneZoho:m.zohoPdf,telechargerPreuveZoho:m.zohoPreuve,telechargerDossierSigneZoho:m.zohoDossier}));
vi.mock("@/lib/controle-effets",()=>({verifierAvantEffet:m.garde}));
import { synchroniserCircuitSignatureBail } from "@/lib/signature-bail-worker";
const config={prestataire:"zoho" as const,environnement:"sandbox" as const,clientId:"test",clientSecret:"test",refreshToken:"test"};
const parties=[{externalId:"s1",prenom:"Alice",nom:"Test",email:"alice@example.test"},{externalId:"s2",prenom:"Benoit",nom:"Test",email:"benoit@example.test"}];
function base(etat="en_cours",environnement="sandbox",prestataire="zoho",modele="bail",signataires=parties) {
 const rpc=vi.fn(async(n:string,..._params:unknown[])=>({data:n==="verrouiller_signature_bail"?true:"document-signe",error:null}));
 const update=vi.fn(()=>query);
 const query={select:vi.fn(()=>query),eq:vi.fn(()=>query),single:vi.fn(async()=>({data:{id:"circuit",prestataire,modele,organization_id:"org",environnement,etat,external_request_id:"req",external_document_id:"doc",signataires},error:null})),update,then:(resolve:(v:unknown)=>void)=>Promise.resolve({error:null}).then(resolve)};
 const upload=vi.fn(async(_path:string,_contenu:Uint8Array,_options:unknown)=>({error:null}));
 const db={rpc,from:vi.fn(()=>query),storage:{from:vi.fn(()=>({upload}))}};
 return {db:db as unknown as SupabaseClient,rpc,update,upload};
}
beforeEach(()=>{
 vi.resetAllMocks();m.garde.mockResolvedValue(undefined);
 m.zohoLire.mockResolvedValue({id:"req",external_id:"circuit",status:"done",signers:parties.map(s=>({id:s.externalId,email:s.email,status:"signed"}))});
 m.zohoPdf.mockResolvedValue(new TextEncoder().encode("%PDF-contrat"));m.zohoPreuve.mockResolvedValue(new TextEncoder().encode("%PDF-preuve"));
});
afterEach(()=>vi.restoreAllMocks());
describe("Rapprochement des signatures",()=>{
 it("archive le contrat et les preuves des deux parties avant de finaliser",async()=>{
  const b=base();await synchroniserCircuitSignatureBail(b.db,config,"circuit");
  expect(b.upload.mock.calls.map(c=>c[0])).toEqual(["org/signature-bail/circuit/contrat.pdf","org/signature-bail/circuit/preuve-1.pdf"]);
  expect(m.zohoPreuve).toHaveBeenCalledExactlyOnceWith(config,"req");
  expect(b.rpc).toHaveBeenCalledWith("archiver_signature_bail",expect.objectContaining({p_circuit:"circuit",p_archives:expect.arrayContaining([expect.objectContaining({size:12})])}));
  expect(b.update).toHaveBeenLastCalledWith({verrou_jeton:null,verrou_jusqua:null});
 });
 it("ne se fie pas à un signal de fin si le prestataire indique encore une attente",async()=>{
  m.zohoLire.mockResolvedValue({id:"req",external_id:"circuit",status:"ongoing",signers:parties.map((s,i)=>({id:s.externalId,email:s.email,status:i===0?"signed":"notified"}))});
  const b=base();await synchroniserCircuitSignatureBail(b.db,config,"circuit");expect(b.upload).not.toHaveBeenCalled();
 });
 it("une preuve manquante empêche le classement final et la reprise utilise les mêmes chemins",async()=>{
  const b=base();m.zohoPreuve.mockRejectedValueOnce(new Error("PDF pas encore prêt"));
  await expect(synchroniserCircuitSignatureBail(b.db,config,"circuit")).rejects.toThrow("PDF pas encore prêt");
  expect(b.rpc.mock.calls.filter(([nom])=>nom==="archiver_signature_bail")).toHaveLength(0);
  await synchroniserCircuitSignatureBail(b.db,config,"circuit");
  expect(b.upload.mock.calls.filter(c=>c[0]==="org/signature-bail/circuit/contrat.pdf")).toHaveLength(2);
  expect(b.rpc.mock.calls.filter(([nom])=>nom==="archiver_signature_bail")).toHaveLength(1);
 });
 it.each([
  {external_id:"autre-circuit",message:"référence"},
  {signers:[{id:"s1",status:"signed"},{id:"inconnu",status:"signed"}],message:"signataires"},
  {signers:parties.map((s,i)=>({id:s.externalId,email:s.email,status:i===0?"signed":"notified"})),message:"toutes les signatures"},
 ])("refuse un retour incohérent (%j)",async({message,...partiel})=>{
  m.zohoLire.mockResolvedValue({...await m.zohoLire(),...partiel});const b=base();
  await expect(synchroniserCircuitSignatureBail(b.db,config,"circuit")).rejects.toThrow(message);expect(b.upload).not.toHaveBeenCalled();
 });
 it("un circuit déjà archivé ne télécharge pas une seconde copie",async()=>{
  const b=base("termine");await synchroniserCircuitSignatureBail(b.db,config,"circuit");expect(m.zohoLire).not.toHaveBeenCalled();expect(b.upload).not.toHaveBeenCalled();
 });
 it("refuse de traiter une demande de production avec une clé sandbox",async()=>{
  const b=base("en_cours","production");await expect(synchroniserCircuitSignatureBail(b.db,config,"circuit")).rejects.toThrow("connexion");expect(m.zohoLire).not.toHaveBeenCalled();
 });
 it("un verrou occupé interdit un second traitement",async()=>{
  const b=base();b.rpc.mockResolvedValueOnce({data:false,error:null});
  await expect(synchroniserCircuitSignatureBail(b.db,config,"circuit")).rejects.toThrow("en cours de vérification");expect(m.zohoLire).not.toHaveBeenCalled();
 });
 it("respecte l’arrêt de supervision avant tout appel au prestataire",async()=>{
  const b=base();m.garde.mockRejectedValue(new Error("arrêt demandé"));
  await expect(synchroniserCircuitSignatureBail(b.db,config,"circuit")).rejects.toThrow("arrêt");expect(m.zohoLire).not.toHaveBeenCalled();expect(b.update).toHaveBeenLastCalledWith({verrou_jeton:null,verrou_jusqua:null});
 });
});

describe("Certificat commun Zoho",()=>{
 const zoho={prestataire:"zoho" as const,environnement:"sandbox" as const,clientId:"test",clientSecret:"test",refreshToken:"test"};
 it("télécharge une seule preuve commune et la rattache aux deux signataires",async()=>{
  m.zohoLire.mockResolvedValue({id:"req",external_id:"circuit",status:"done",signers:parties.map(s=>({id:s.externalId,status:"signed",email:s.email}))});
  m.zohoPdf.mockResolvedValue(new TextEncoder().encode("%PDF-dossier"));m.zohoPreuve.mockResolvedValue(new TextEncoder().encode("%PDF-certificat"));
  const b=base("en_cours","sandbox","zoho");await synchroniserCircuitSignatureBail(b.db,zoho,"circuit");
  expect(m.zohoPreuve).toHaveBeenCalledTimes(1);expect(b.upload).toHaveBeenCalledTimes(2);
  const archives=b.rpc.mock.calls.find(([nom])=>nom==="archiver_signature_bail")?.[1] as unknown as {p_archives:{path:string}[]};
  expect(archives.p_archives[1]).toEqual(archives.p_archives[2]);
 });
 it("une réattribution à un autre e-mail empêche de déclarer le bail terminé",async()=>{
  m.zohoLire.mockResolvedValue({id:"req",external_id:"circuit",status:"done",signers:parties.map(s=>({id:s.externalId,status:"signed",email:"autre@example.test"}))});
  const b=base("en_cours","sandbox","zoho");await expect(synchroniserCircuitSignatureBail(b.db,zoho,"circuit")).rejects.toThrow("destinataire");expect(b.upload).not.toHaveBeenCalled();
 });
 it("un changement de prestataire ne redirige pas un ancien circuit",async()=>{
  const b=base("en_cours","sandbox","youtrust");await expect(synchroniserCircuitSignatureBail(b.db,zoho,"circuit")).rejects.toThrow("connexion");expect(m.zohoLire).not.toHaveBeenCalled();
 });
});

it("archive l’offre artisan complète avec l’acceptation, sans réassembler le PDF signé",async()=>{
 const cfg={prestataire:"zoho" as const,environnement:"sandbox" as const,clientId:"test",clientSecret:"test",refreshToken:"test"};
 const b=base("en_cours","sandbox","zoho","devis_artisan");
 m.zohoLire.mockResolvedValue({id:"req",external_id:"circuit",status:"done",signers:parties.map(s=>({id:s.externalId,email:s.email,status:"signed"}))});
 m.zohoDossier.mockResolvedValue(new TextEncoder().encode("%PDF-offre-et-acceptation"));m.zohoPreuve.mockResolvedValue(new TextEncoder().encode("%PDF-preuve"));
 await synchroniserCircuitSignatureBail(b.db,cfg,"circuit");
 expect(m.zohoDossier).toHaveBeenCalledWith(cfg,"req");expect(m.zohoPdf).not.toHaveBeenCalled();
 expect(b.upload.mock.calls[0][1]).toEqual(new TextEncoder().encode("%PDF-offre-et-acceptation"));
});

const mentionTest="Je m'engage en qualité de caution " + "mention complète du test ".repeat(12);
it.each(["ok","",undefined,"Je m'engage"])("ne classe pas un cautionnement malgré toutes les signatures si la mention vaut %s",async mention=>{
 const b=base("en_cours","sandbox","zoho","cautionnement",parties.map((s,i)=>({...s,qualite:i===0?"Garant":"Propriétaire",mentionCaution:i===0?mentionTest:undefined})));
 m.zohoLire.mockResolvedValue({id:"req",external_id:"circuit",status:"done",signers:parties.map(s=>({id:s.externalId,email:s.email,status:"signed",mentions:[mention]}))});
 await synchroniserCircuitSignatureBail(b.db,{prestataire:"zoho",environnement:"sandbox",clientId:"test",clientSecret:"test",refreshToken:"test"},"circuit");
 expect(b.upload).not.toHaveBeenCalled();
 expect(b.update).toHaveBeenCalledWith(expect.objectContaining({etat:"a_verifier",erreur:expect.stringContaining("OK")}));
 expect(b.rpc.mock.calls.some(([n])=>n==="archiver_signature_bail")).toBe(false);
});
it("classe la caution seulement si la mention personnelle correspond au texte figé",async()=>{
 const b=base("en_cours","sandbox","zoho","cautionnement",parties.map((s,i)=>({...s,qualite:i===0?"Garant":"Propriétaire",mentionCaution:i===0?mentionTest:undefined})));
 m.zohoLire.mockResolvedValue({id:"req",external_id:"circuit",status:"done",signers:parties.map(s=>({id:s.externalId,email:s.email,status:"signed",mentions:[mentionTest]}))});
 m.zohoPdf.mockResolvedValue(new TextEncoder().encode("%PDF-caution"));m.zohoPreuve.mockResolvedValue(new TextEncoder().encode("%PDF-preuve"));
 await synchroniserCircuitSignatureBail(b.db,{prestataire:"zoho",environnement:"sandbox",clientId:"test",clientSecret:"test",refreshToken:"test"},"circuit");
 expect(b.rpc.mock.calls.some(([n])=>n==="archiver_signature_bail")).toBe(true);
});
