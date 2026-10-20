import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({rpc:vi.fn(),activite:vi.fn(),download:vi.fn(),signer:vi.fn(),storage:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:"acteur"}}})},rpc:m.rpc})}));
vi.mock("@/lib/supabase/service",()=>({clientDeService:()=>({storage:{from:m.storage}})}));
vi.mock("@/lib/artisan-prive",()=>({chargerActivitePrivee:m.activite}));
vi.mock("@/lib/parcours-devis-serveur",()=>({chargerPreparationDevis:async()=>{throw Error("Pas de préparation");}}));
vi.mock("@/lib/documents/rendu",()=>({rendrePdf:vi.fn()}));
import { GET as prive } from "@/app/api/artisan-prive/pieces/[pieceId]/route";
import { GET as signature } from "@/app/api/devis/[sollicitationId]/signature/route";
import { GET as devis } from "@/app/api/devis/[sollicitationId]/pdf/route";
afterEach(()=>vi.unstubAllEnvs());
const octets=Buffer.alloc(6*1024*1024,32);octets.write("%PDF-1.7");
const sha=createHash("sha256").update(octets).digest("hex");
const piece={id:"piece",storage_path:"artisan/piece.pdf",mime:"application/pdf",nom:"Pièce",sha256:sha};
const archive={id:"reference",etat:"termine",document_path:"org/devis.pdf",document_hash:sha,preuve_path:"org/preuve.pdf",preuve_hash:sha,pdf_path:"org/devis.pdf",pdf_sha:sha,pdf_bucket:"documents"};
beforeEach(()=>{vi.resetAllMocks();vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL","https://stockage.example.invalid");m.storage.mockReturnValue({download:m.download,createSignedUrl:m.signer});m.download.mockResolvedValue({data:new Blob([octets]),error:null});m.signer.mockResolvedValue({data:{signedUrl:"https://stockage.example.invalid/fichier?token=fictif"},error:null});m.rpc.mockResolvedValue({data:archive,error:null});m.activite.mockResolvedValue({data:{pieces:[piece]},supabase:{storage:{from:m.storage}}});});
const routes=[
 {nom:"pièce privée",appel:()=>prive(new Request("https://gerimmo.example.invalid/piece"),{params:Promise.resolve({pieceId:"piece"})}),compartiment:"artisan-prive",path:piece.storage_path},
 {nom:"devis signé",appel:()=>signature(new Request("https://gerimmo.example.invalid/signature"),{params:Promise.resolve({sollicitationId:"demande"})}),compartiment:"documents",path:archive.document_path},
 {nom:"preuve de signature",appel:()=>signature(new Request("https://gerimmo.example.invalid/signature?preuve=1"),{params:Promise.resolve({sollicitationId:"demande"})}),compartiment:"documents",path:archive.preuve_path},
 {nom:"devis archivé",appel:()=>devis(new Request("https://gerimmo.example.invalid/devis?version=1"),{params:Promise.resolve({sollicitationId:"demande"})}),compartiment:"documents",path:archive.pdf_path},
];
for(const r of routes)describe(r.nom,()=>{
 it("ouvre les 6 Mo avec une petite réponse et une seconde vérification dans le navigateur",async()=>{const reponse=await r.appel();expect(reponse.status).toBe(200);const html=await reponse.text();expect(Buffer.byteLength(html)).toBeLessThan(10000);expect(html).toContain(sha);expect(reponse.headers.get("Content-Type")).toContain("text/html");expect(reponse.headers.get("Cache-Control")).toBe("private, no-store");expect(m.storage).toHaveBeenCalledWith(r.compartiment);expect(m.signer).toHaveBeenCalledWith(r.path,60,undefined);});
 it("ne signe aucun lien si les octets sont altérés",async()=>{m.download.mockResolvedValue({data:new Blob(["altéré"]),error:null});expect((await r.appel()).status).toBeGreaterThanOrEqual(400);expect(m.signer).not.toHaveBeenCalled();});
 it("ne signe aucun lien en cas de refus métier",async()=>{m.rpc.mockResolvedValue({data:null,error:{}});m.activite.mockResolvedValue({data:{pieces:[]},supabase:{storage:{from:m.storage}}});expect((await r.appel()).status).toBe(403);expect(m.download).not.toHaveBeenCalled();expect(m.signer).not.toHaveBeenCalled();});
});
it("n’ouvre pas un compartiment inattendu indiqué dans une archive",async()=>{m.rpc.mockResolvedValue({data:{...archive,pdf_bucket:"autre"},error:null});expect((await routes[3].appel()).status).toBe(503);expect(m.download).not.toHaveBeenCalled();expect(m.signer).not.toHaveBeenCalled();});
