import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({acces:vi.fn(),service:vi.fn(),lire:vi.fn(),rappeler:vi.fn(),supprimer:vi.fn(),sync:vi.fn(),update:vi.fn(),stop:vi.fn(),circuit:{} as Record<string,unknown>}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/ged-acces",()=>({verifierGerant:m.acces}));
vi.mock("@/lib/supabase/service",()=>({clientDeService:m.service}));
vi.mock("@/lib/signature-bail",()=>({configurationSignatureBail:()=>null,configurationSuiviSignatureBail:()=>({prestataire:"zoho",environnement:"sandbox"}),assemblerSignatureBail:async()=>({empreinte:"test",signataires:[],annexes:[],manquants:[]})}));
vi.mock("@/lib/signature-prestataire",()=>({lireDemandeSignature:m.lire,annulerDemandeSignature:m.rappeler,supprimerBrouillonSignature:m.supprimer}));
vi.mock("@/lib/signature-bail-worker",()=>({synchroniserCircuitSignatureBail:m.sync}));
vi.mock("@/lib/controle-effets",()=>({verifierAvantEffet:m.stop}));
import {annulerSignatureBail} from "@/app/actions/signature-bail";
const action=()=>annulerSignatureBail("org","bail","circuit");
const distant=(status:string)=>({id:"req",external_id:"circuit",status});
beforeEach(()=>{
 vi.resetAllMocks();m.circuit={id:"circuit",etat:"en_cours",prestataire:"zoho",environnement:"sandbox",external_request_id:"req",empreinte:"test"};
 const q={select:()=>q,eq:()=>q,in:()=>q,order:()=>q,limit:async()=>({data:[m.circuit],error:null}),single:async()=>({data:m.circuit,error:null}),update:m.update,then:(resolve:(v:unknown)=>void)=>Promise.resolve({error:null}).then(resolve)};
 m.update.mockReturnValue(q);const db={from:()=>q,rpc:async()=>({data:true,error:null})};
 m.service.mockReturnValue(db);m.acces.mockResolvedValue({user:{id:"proprietaire"},supabase:db});
 m.lire.mockResolvedValue(distant("ongoing"));
});
describe("Arrêt confirmé, sans perdre le sens du résultat",()=>{
 it("annule avec les nouveaux envois coupés seulement après confirmation de la même demande",async()=>{
  m.lire.mockResolvedValueOnce(distant("ongoing")).mockResolvedValueOnce(distant("canceled"));
  expect((await action()).succes).toContain("annulé");expect(m.rappeler).toHaveBeenCalledTimes(1);expect(m.update).toHaveBeenCalledWith(expect.objectContaining({etat:"annule"}));
 });
 it.each(["ongoing","done"])("une confirmation %s ne libère pas artificiellement le circuit",async status=>{
  m.lire.mockResolvedValueOnce(distant("ongoing")).mockResolvedValueOnce(distant(status));
  expect((await action()).erreur).toContain("confirmée");expect(m.update).not.toHaveBeenCalled();
 });
 it("une coupure après le rappel conserve la demande pour rapprochement",async()=>{
  m.rappeler.mockRejectedValue(new Error("coupure"));expect((await action()).erreur).toBeTruthy();expect(m.update).not.toHaveBeenCalled();
 });
 it.each(["expired","declined","rejected"])("classe un état %s avec le suivi, sans l’écraser par une annulation",async status=>{
  m.lire.mockResolvedValue(distant(status));expect((await action()).succes).toBeTruthy();expect(m.sync).toHaveBeenCalledTimes(1);expect(m.rappeler).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
 });
 it("récupère le contrat déjà signé sans demander son annulation",async()=>{
  m.lire.mockResolvedValue(distant("done"));expect((await action()).succes).toContain("déjà signé");expect(m.sync).toHaveBeenCalledTimes(1);expect(m.rappeler).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
 });
 it("vérifie la corbeille Zoho après le retrait d’un brouillon",async()=>{
  m.lire.mockResolvedValueOnce(distant("draft")).mockResolvedValueOnce(distant("deleted"));
  expect((await action()).succes).toContain("annulé");expect(m.supprimer).toHaveBeenCalledTimes(1);expect(m.rappeler).not.toHaveBeenCalled();
 });
 it.each(["draft","ongoing"])("le retrait non confirmé d’un brouillon (%s) conserve le suivi",async status=>{
  m.lire.mockResolvedValueOnce(distant("draft")).mockResolvedValueOnce(distant(status));expect((await action()).erreur).toContain("confirmé");expect(m.update).not.toHaveBeenCalled();
 });
 it("refuse une confirmation qui concerne une autre référence",async()=>{
  m.lire.mockResolvedValueOnce(distant("ongoing")).mockResolvedValueOnce({...distant("canceled"),external_id:"autre"});expect((await action()).erreur).toContain("confirmée");expect(m.update).not.toHaveBeenCalled();
 });
 it("respecte l’arrêt général avant tout rappel externe",async()=>{
  m.stop.mockRejectedValue(new Error("arrêt demandé"));expect((await action()).erreur).toContain("arrêt");expect(m.lire).not.toHaveBeenCalled();expect(m.rappeler).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
 });
});
