import { describe,it,expect,vi } from "vitest";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { verifierArchivesSignature,controlerCircuitConserve,preparerPurgeCopieSignature,type ArchiveConservation } from "../src/lib/conservation-signatures";
const org="10000000-0000-4000-8000-000000000001",pdf="10000000-0000-4000-8000-000000000002",preuve="10000000-0000-4000-8000-000000000003";
const contenu=Buffer.from("%PDF-1.7\narchive pour contrôle unitaire\n%%EOF");
const document=(id:string):ArchiveConservation=>({id,organization_id:org,storage_path:`${org}/${id}.pdf`,mime_type:"application/pdf",taille_octets:contenu.length,empreinte:createHash("sha256").update(contenu).digest("hex"),purged_at:null});
const circuit={id:pdf,organization_id:org,etat:"termine",document_signe:pdf,signataires:[{statut:"signed",preuveDocumentId:preuve},{statut:"signed",preuveDocumentId:preuve}]};
describe("vérification des archives avant suppression d'une copie",()=>{
  it("relit le contrat et le certificat partagé une seule fois",async()=>{const lire=vi.fn(async()=>new Blob([contenu]));expect(await verifierArchivesSignature(circuit,[document(pdf),document(preuve)],lire)).toMatchObject({ok:true,fichiers:2});expect(lire).toHaveBeenCalledTimes(2);});
  it.each([0,1])("refuse le contrat comme certificat du signataire %i, même si l'autre certificat existe",async index=>{
    const signataires=circuit.signataires.map((s,i)=>i===index?{...s,preuveDocumentId:pdf}:s);
    const lire=vi.fn(async()=>new Blob([contenu]));
    expect(await verifierArchivesSignature({...circuit,signataires},[document(pdf),document(preuve)],lire)).toMatchObject({ok:false,motif:"certificat_distinct_manquant"});
    expect(lire).not.toHaveBeenCalled();
  });
  it.each(["empreinte","taille","absent","purge","organisation","certificat"])("refuse une archive %s invalide",async cas=>{
    const docs=[document(pdf),document(preuve)];
    if(cas==="empreinte")docs[0].empreinte="a".repeat(64);
    if(cas==="taille")docs[0].taille_octets++;
    if(cas==="purge")docs[0].purged_at="2026-01-01T00:00:00Z";
    if(cas==="organisation")docs[0].organization_id=preuve;
    if(cas==="certificat")docs.pop();
    expect((await verifierArchivesSignature(circuit,docs,async()=>cas==="absent"?null:new Blob([contenu]))).ok).toBe(false);
  });
  it("ne prend ni une panne ni un contrat en cours pour une archive vérifiée",async()=>{
    expect((await verifierArchivesSignature(circuit,[document(pdf),document(preuve)],async()=>{throw Error("panne privée");})).motif).toBe("lecture_indisponible");
    const lire=vi.fn();expect((await verifierArchivesSignature({...circuit,etat:"en_cours"},[],lire)).ok).toBe(false);expect(lire).not.toHaveBeenCalled();
  });
  it("aucune règle implicite ne permet de préparer une suppression",()=>{
    expect(preparerPurgeCopieSignature({archives:{ok:true,fichiers:2,motif:"archives_verifiees"}}).eligible).toBe(false);
  });
  it("signale un signataire historique mal formé sans interrompre le contrôle",async()=>{
    const lire=vi.fn();
    for(const signataires of [[null],[{}],[42]]) {
      const historique={...circuit,signataires} as unknown as typeof circuit;
      await expect(verifierArchivesSignature(historique,[],lire)).resolves.toMatchObject({ok:false,motif:"certificat_manquant"});
    }
    expect(lire).not.toHaveBeenCalled();
  });
  it("exige une règle validée, une échéance, l'absence de litige et une sauvegarde récente",()=>{
    const now=Date.parse("2026-10-22T10:00:00Z");const p={archives:{ok:true,fichiers:2,motif:"archives_verifiees"},regle:{referenceValidation:"validation locale du test",valideeLe:"2026-10-20T10:00:00Z",delaiJours:1},declencheurLe:"2026-10-20T10:00:00Z",sauvegardeVerifieeLe:"2026-10-22T08:00:00Z",litige:false};
    expect(preparerPurgeCopieSignature(p,now).eligible).toBe(true);
    for(const changements of [{litige:true},{litige:undefined},{sauvegardeVerifieeLe:"2026-10-20T08:00:00Z"},{declencheurLe:"2026-10-23T10:00:00Z"},{regle:{...p.regle,delaiJours:NaN}}])expect(preparerPurgeCopieSignature({...p,...changements},now).eligible).toBe(false);
  });
});

describe("lecture bornée des archives, sans connexion externe",()=>{
  const client=(requete:typeof fetch)=>createClient("https://archive.example.invalid","cle-unitaire",{
    auth:{persistSession:false,autoRefreshToken:false},global:{fetch:requete},
  });
  it("transmet la même limite de temps aux métadonnées et aux deux fichiers",async()=>{
    const signal=new AbortController().signal;
    const appels:{url:string;signal:AbortSignal|null|undefined;cache?:RequestCache}[]=[];
    const requete:typeof fetch=async(input,init)=>{
      const url=String(input);appels.push({url,signal:init?.signal,cache:init?.cache});
      if(url.includes("/rest/v1/documents"))return Response.json([document(pdf),document(preuve)]);
      if(url.includes("/storage/v1/object/documents/"))return new Response(contenu,{headers:{"content-type":"application/pdf"}});
      throw Error("Destination non prévue");
    };
    expect(await controlerCircuitConserve(client(requete),circuit,signal)).toMatchObject({ok:true,fichiers:2});
    expect(appels).toHaveLength(3);expect(appels.every(a=>a.signal===signal)).toBe(true);
    expect(appels.filter(a=>a.url.includes("/storage/")).every(a=>a.cache==="no-store")).toBe(true);
  });
  it("ne démarre aucune requête lorsque le délai est déjà écoulé",async()=>{
    const controleur=new AbortController();controleur.abort();
    const requete=vi.fn<typeof fetch>();
    expect(await controlerCircuitConserve(client(requete),circuit,controleur.signal)).toMatchObject({ok:false,motif:"lecture_indisponible"});
    expect(requete).not.toHaveBeenCalled();
  });
  it("refuse les signataires mal formés avant toute lecture privilégiée",async()=>{
    const requete=vi.fn<typeof fetch>();
    const historique={...circuit,signataires:[null]} as unknown as typeof circuit;
    expect(await controlerCircuitConserve(client(requete),historique)).toMatchObject({ok:false,motif:"certificat_manquant"});
    expect(requete).not.toHaveBeenCalled();
  });
  it("un téléchargement interrompu n'est pas présenté comme un fichier absent ou valide",async()=>{
    const requete:typeof fetch=async(input)=>{
      if(String(input).includes("/rest/v1/documents"))return Response.json([document(pdf),document(preuve)]);
      throw new DOMException("Texte fournisseur privé","AbortError");
    };
    const r=await controlerCircuitConserve(client(requete),circuit);
    expect(r).toMatchObject({ok:false,motif:"lecture_indisponible"});
    expect(JSON.stringify(r)).not.toContain("privé");
  });
});
