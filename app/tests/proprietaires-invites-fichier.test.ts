import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn(), download: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.user }, rpc: mocks.rpc, storage: { from: mocks.from } }) }));
import { GET } from "@/app/proprietaire-invite/[orgId]/documents/[documentId]/fichier/route";
const org = "01111111-1111-4111-8111-111111111111", document = "02222222-2222-4222-8222-222222222222";
const requete = (mode = "") => new NextRequest(`http://localhost/proprietaire-invite/${org}/documents/${document}/fichier${mode}`);
const params = { params: Promise.resolve({ orgId: org, documentId: document }) };
beforeEach(() => {
 vi.clearAllMocks();
 mocks.user.mockResolvedValue({ data: { user: { id: "invite" } } });
 mocks.rpc.mockResolvedValue({ data: [{ storage_path: `${org}/rapport.pdf`, mime_type: "application/pdf", titre: "Rapport" }], error: null });
 mocks.from.mockReturnValue({ download: mocks.download });
 mocks.download.mockResolvedValue({ data: new Blob(["%PDF-1.4\n%%EOF"],{type:"application/pdf"}), error: null });
});
describe("PDF du propriétaire invité — droits avant lecture du fichier", () => {
 it("refuse une adresse invalide sans interroger la session ni les fichiers", async () => {
   expect((await GET(requete(), { params: Promise.resolve({orgId:"../autre",documentId:document}) })).status).toBe(404);
   expect(mocks.user).not.toHaveBeenCalled();expect(mocks.download).not.toHaveBeenCalled();
 });
 it("demande une session puis refuse un dossier étranger sans lire le stockage", async () => {
   mocks.user.mockResolvedValueOnce({data:{user:null}});expect((await GET(requete(),params)).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();
   mocks.rpc.mockResolvedValueOnce({data:null,error:{message:"interdit"}});expect((await GET(requete(),params)).status).toBe(403);expect(mocks.download).not.toHaveBeenCalled();
 });
 it.each([
   {storage_path:"autre/rapport.pdf",mime_type:"application/pdf"},
   {storage_path:`${org}/../autre.pdf`,mime_type:"application/pdf"},
   {storage_path:`${org}/rapport.html`,mime_type:"text/html"},
 ])("rejette un chemin ou format incohérent fourni par la base : %j", async doc => {
   mocks.rpc.mockResolvedValue({data:[doc],error:null});expect((await GET(requete(),params)).status).toBe(403);expect(mocks.download).not.toHaveBeenCalled();
 });
 it("un PDF autorisé est téléchargé avec la session, sans cache partagé", async () => {
   const r = await GET(requete("?mode=telechargement"), params);
   expect(r.status).toBe(200);expect(r.headers.get("content-type")).toBe("application/pdf");expect(r.headers.get("content-disposition")).toContain("attachment");expect(r.headers.get("cache-control")).toBe("private, no-store");expect(r.headers.get("x-content-type-options")).toBe("nosniff");
   expect(mocks.rpc).toHaveBeenCalledWith("proprietaire_invite_fichier",{p_org:org,p_document:document,p_mode:"telechargement"});expect(mocks.from).toHaveBeenCalledWith("documents");expect(mocks.download).toHaveBeenCalledWith(`${org}/rapport.pdf`);expect(await r.text()).toContain("%PDF");
 });
 it("un fichier absent ne produit jamais un faux PDF réussi",async()=>{
   mocks.download.mockResolvedValue({data:null,error:{message:"missing"}});const r=await GET(requete(),params);expect(r.status).toBe(502);expect(r.headers.get("content-type")).toContain("text/html");
 });
});
