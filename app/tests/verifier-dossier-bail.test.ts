import { expect, it, vi, beforeEach } from "vitest";
const banc=vi.hoisted(()=>({user: true, query: vi.fn(), assembler:vi.fn(), eq:vi.fn()}));
vi.mock("@/lib/ged-acces",()=>({verifierGerant:async()=>{const q={select:()=>q,eq:(...args:unknown[])=>{banc.eq(...args);return q;},maybeSingle:banc.query};return {user:banc.user?{id:"u"}:null,supabase:{from:()=>q}};}}));
vi.mock("@/lib/documents/modeles",()=>({MODELES:{bail_nu:{assembler:banc.assembler},bail_meuble:{assembler:banc.assembler},bail_colocation:{assembler:banc.assembler},bail_individuel:{assembler:banc.assembler}}}));
import { verifierDossierBail } from "@/app/agence/[orgId]/baux/[bailId]/verifier-dossier";
beforeEach(()=>{vi.clearAllMocks();banc.user=true;banc.query.mockResolvedValue({data:{type:"nu",chambre_id:null},error:null});banc.assembler.mockResolvedValue({document:{manquants:["surface","surface","chauffage"]}});});
it("réutilise le contrôle du modèle et limite la lecture au bail de l’organisation",async()=>{expect(await verifierDossierBail("org","bail")).toEqual({manquants:["surface","chauffage"]});expect(banc.eq).toHaveBeenCalledWith("organization_id","org");expect(banc.eq).toHaveBeenCalledWith("id","bail");});
it("refuse une session absente",async()=>{banc.user=false;expect((await verifierDossierBail("org","bail")).erreur).toBeTruthy();expect(banc.assembler).not.toHaveBeenCalled();});
it("ne présente pas une erreur de lecture comme un dossier complet",async()=>{banc.assembler.mockResolvedValue({erreur:"Lecture refusée"});expect((await verifierDossierBail("org","bail")).erreur).toBe("Lecture refusée");});
