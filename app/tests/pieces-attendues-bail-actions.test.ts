import { beforeEach, describe, expect, it, vi } from "vitest";
const ORG="00000000-0000-4000-8000-000000000001", BAIL="00000000-0000-4000-8000-000000000002", LOT="00000000-0000-4000-8000-000000000003", DOC="00000000-0000-4000-8000-000000000004", AUTRE="00000000-0000-4000-8000-000000000005";
const m=vi.hoisted(()=>({autorise:true,etat:"brouillon",purge:false,documentVisible:true,expiration:null as string|null,horsPortefeuille:false,remplace:false,actuelle:null as string|null,erreurClassement:false,confirmationVide:false,rpc:vi.fn(),lectures:[] as {table:string;filtres:Record<string,unknown>}[],ecritures:[] as {table:string;ligne:Record<string,unknown>;options:unknown}[],depot:vi.fn(),resoudre:vi.fn(),revalidate:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
vi.mock("@/lib/ged",()=>({aujourdhuiParis:()=>"2026-10-27"}));
vi.mock("@/lib/depot-direct",()=>({resoudreDepotsFormulaire:m.resoudre}));
vi.mock("@/lib/ged-depot",()=>({deposerFichierGed:m.depot}));
vi.mock("@/lib/ged-acces",()=>({verifierGerant:async()=>({user:m.autorise?{id:"moi"}:null,supabase:{
 rpc:async(nom:string,args:unknown)=>{if(nom==="lot_hors_portefeuille")return {data:m.horsPortefeuille,error:null};m.rpc(nom,args);return {data:m.confirmationVide?null:DOC,error:m.erreurClassement?{message:"refus"}:null};},
 from(table:string){const filtres:Record<string,unknown>={};const q={
  select:()=>q,limit:()=>q,is:(k:string,v:unknown)=>{filtres[k]=v;return q;},eq:(k:string,v:unknown)=>{filtres[k]=v;return q;},
  maybeSingle:async()=>{m.lectures.push({table,filtres});return {data:table==="pieces_attendues_bail"?m.actuelle?{document_id:m.actuelle}:null:table==="documents"&&filtres.remplace_id?m.remplace?{id:AUTRE}:null:table==="baux"?filtres.organization_id===ORG&&filtres.id===BAIL?{id:BAIL,lot_id:LOT,etat:m.etat,lot:{bien_id:"bien"}}:null:m.documentVisible&&filtres.organization_id===ORG&&filtres.id===DOC?{id:DOC,purged_at:m.purge?"2026-01-01":null,expire_le:m.expiration}:null,error:null};},
  upsert:(ligne:Record<string,unknown>,options:unknown)=>{m.ecritures.push({table,ligne,options});return q;},
  single:async()=>({data:m.confirmationVide?null:{document_id:DOC},error:m.erreurClassement?{message:"refus"}:null}),
  then:(resolve:(r:unknown)=>unknown)=>Promise.resolve(resolve({error:null})),
 };return q;},
}})}));
import {enregistrerPieceAttendueBail} from "@/app/actions/pieces-attendues-bail";
import type {NaturePieceAttendue} from "@/lib/pieces-attendues-bail";
const form=(champs:Record<string,string|File>={document_id:DOC})=>{const f=new FormData();for(const [k,v] of Object.entries(champs))f.set(k,v);return f;};
const envoyer=(f=form(),nature:NaturePieceAttendue="assurance_proprietaire",org=ORG,bail=BAIL)=>enregistrerPieceAttendueBail(org,bail,nature,{},f);
beforeEach(()=>{vi.clearAllMocks();Object.assign(m,{autorise:true,etat:"brouillon",purge:false,documentVisible:true,expiration:null,horsPortefeuille:false,remplace:false,actuelle:null,erreurClassement:false,confirmationVide:false});m.lectures.length=0;m.ecritures.length=0;m.resoudre.mockResolvedValue(null);m.depot.mockResolvedValue({documentId:DOC});});
describe("assurances explicitement identifiées dans le bail",()=>{
 it("rattache la pièce propriétaire au lot dérivé du bail, sans reprendre les cibles envoyées",async()=>{
  const retour=await envoyer(form({document_id:DOC,lot_id:AUTRE,organization_id:AUTRE,bail_id:AUTRE}));
  expect(retour.statut).toBe("couverture_a_verifier");expect(retour.succes).toContain("couverture reste à vérifier");
  expect(m.rpc).toHaveBeenCalledWith("affecter_piece_attendue_bail",{p_org:ORG,p_bail:BAIL,p_nature:"assurance_proprietaire",p_document:DOC,p_document_precedent:null});
  expect(m.lectures.find(l=>l.table==="pieces_attendues_bail")?.filtres).toMatchObject({organization_id:ORG,lot_id:LOT,bail_id:null});
  expect(m.revalidate).toHaveBeenCalledWith(`/espace/${ORG}/baux/${BAIL}`);expect(m.revalidate).toHaveBeenCalledWith(`/agence/${ORG}/baux/${BAIL}`);
 });
 it("isole l’assurance locataire sur son contrat",async()=>{
  await envoyer(form(),"assurance_locataire");expect(m.rpc).toHaveBeenCalledWith("affecter_piece_attendue_bail",expect.objectContaining({p_bail:BAIL,p_nature:"assurance_locataire"}));expect(m.lectures.find(l=>l.table==="pieces_attendues_bail")?.filtres.bail_id).toBe(BAIL);
 });
 it("dépose sans titre demandé et sans écraser l’ancienne pièce",async()=>{
  const retour=await envoyer(form({fichier:new File(["pdf"],"perso.pdf"),titre:"Titre ignoré",expire_le:"2027-02-28"}),"assurance_locataire");
  expect(retour.statut).toBe("presente");expect(m.depot).toHaveBeenCalledWith(expect.anything(),expect.anything(),ORG,expect.any(File),"attestation_assurance","Attestation d’assurance du locataire",{expireLe:"2027-02-28"});
 });
 it("conserve une échéance passée sans annoncer une couverture valide",async()=>{
  m.expiration="2026-01-01";const r=await envoyer();expect(r.statut).toBe("expiree");expect(r.succes).toContain("attestation à jour reste à fournir");
 });
 it.each(["2026-02-30","2026-13-01","0000-01-01","28/02/2027"])("refuse une échéance impossible %s avant dépôt",async(expire_le)=>{
  expect((await envoyer(form({fichier:new File(["pdf"],"a.pdf"),expire_le}))).erreur).toContain("date d’échéance valide");expect(m.depot).not.toHaveBeenCalled();expect(m.ecritures).toHaveLength(0);
 });
 it("refuse une fenêtre ancienne avant de déposer un fichier",async()=>{m.actuelle=AUTRE;expect((await envoyer(form({fichier:new File(["pdf"],"a.pdf"),document_precedent_id:DOC}))).erreur).toContain("a changé");expect(m.depot).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();});
 it("transmet la version attendue lors du renouvellement",async()=>{m.actuelle=AUTRE;expect((await envoyer(form({document_id:DOC,document_precedent_id:AUTRE}))).succes).toBeTruthy();expect(m.rpc).toHaveBeenCalledWith("affecter_piece_attendue_bail",expect.objectContaining({p_document_precedent:AUTRE}));});
 it("refuse de sélectionner une ancienne version GED",async()=>{m.remplace=true;expect((await envoyer()).erreur).toContain("nouvelle version");expect(m.rpc).not.toHaveBeenCalled();});
 it("n’altère pas l’échéance immuable d’un document choisi",async()=>{
  expect((await envoyer(form({document_id:DOC,expire_le:"2028-01-01"}))).erreur).toContain("échéance du document existant est conservée");expect(m.ecritures).toHaveLength(0);
 });
 it.each(["purge","documentVisible"] as const)("refuse la pièce purgée ou inaccessible (%s)",async k=>{
  if(k==="purge")m.purge=true;else m.documentVisible=false;expect((await envoyer()).erreur).toContain("inaccessible ou son fichier a été purgé");expect(m.ecritures).toHaveLength(0);
 });
 it.each(["session","bail_actif","portefeuille","autre_org","autre_bail"])("bloque avant transfert : %s",async cas=>{
  if(cas==="session")m.autorise=false;if(cas==="bail_actif")m.etat="actif";if(cas==="portefeuille")m.horsPortefeuille=true;
  expect((await envoyer(form(),"assurance_proprietaire",cas==="autre_org"?AUTRE:ORG,cas==="autre_bail"?AUTRE:BAIL)).erreur).toBeTruthy();expect(m.resoudre).not.toHaveBeenCalled();expect(m.ecritures).toHaveLength(0);
 });
 it("refuse deux sources simultanées et les choix vides",async()=>{
  expect((await envoyer(form({document_id:DOC,fichier:new File(["pdf"],"a.pdf")}))).erreur).toContain("un seul");expect((await envoyer(form({}))).erreur).toContain("un seul");expect(m.depot).not.toHaveBeenCalled();
 });
 it("ne confirme pas un dépôt direct ou GED refusé",async()=>{
  m.resoudre.mockResolvedValue("Transfert incomplet");expect((await envoyer()).erreur).toBe("Transfert incomplet");m.resoudre.mockResolvedValue(null);m.depot.mockResolvedValue({erreur:"PDF incomplet"});expect((await envoyer(form({fichier:new File(["pdf"],"a.pdf")}))).erreur).toBe("PDF incomplet");expect(m.ecritures).toHaveLength(0);
 });
 it.each(["erreurClassement","confirmationVide"] as const)("laisse la pièce existante récupérable sans faux succès : %s",async k=>{
  m[k]=true;const retour=await envoyer();expect(retour.succes).toBeUndefined();expect(retour.erreur).toContain("conservé");expect(retour.documentId).toBe(DOC);
 });
});
