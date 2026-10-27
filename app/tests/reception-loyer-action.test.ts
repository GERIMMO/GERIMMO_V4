import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ acces: vi.fn(), rpc: vi.fn(), revalider: vi.fn(), emission: vi.fn() }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: m.acces }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalider }));
vi.mock("@/lib/quittances", () => ({ emettreRecusQuittances: m.emission }));
import { declarerReceptionLoyer } from "@/app/actions/reception-loyer";
const cle = "bdb1cf28-4a5d-45dd-9235-68cfe916cc50";
const form = () => { const f = new FormData(); for (const [k,v] of Object.entries({ reponse:"recu",cle_envoi:cle,reste_attendu:"800",montant:"800",date_paiement:"2026-01-01",mode:"virement" })) f.set(k,v); return f; };
beforeEach(() => {
  vi.clearAllMocks(); m.acces.mockResolvedValue({ user:{id:"moi"},role:"proprietaire_direct",supabase:{rpc:m.rpc} });
  m.rpc.mockResolvedValue({data:{statut:"enregistre",bail_id:"bail",montant:800},error:null});
  m.emission.mockResolvedValue({quittances:1,recus:0});
});
it("ne laisse pas un autre rôle déclarer la réception",async()=>{
  m.acces.mockResolvedValue({user:{id:"agent"},role:"agent"});
  expect((await declarerReceptionLoyer("org","appel",{},form())).erreur).toBeTruthy();expect(m.rpc).not.toHaveBeenCalled();
});
it("valide les montants et les dates avant toute écriture",async()=>{
  const f=form();f.set("montant","12,345");expect((await declarerReceptionLoyer("org","appel",{},f)).erreur).toContain("centime");expect(m.rpc).not.toHaveBeenCalled();
  f.set("montant","800");f.set("date_paiement","2099-01-01");expect((await declarerReceptionLoyer("org","appel",{},f)).erreur).toBeTruthy();expect(m.rpc).not.toHaveBeenCalled();
});
it("explique comment solder une échéance si le montant partiel couvre tout le reste",async()=>{
  const f=form();f.set("reponse","partiel");
  expect((await declarerReceptionLoyer("org","appel",{},f)).erreur).toContain("inférieur au reste");expect(m.rpc).not.toHaveBeenCalled();
});
it("enregistre sans doublon et actualise le tableau de bord, les finances et le bail",async()=>{
  expect((await declarerReceptionLoyer("org","appel",{},form())).termine).toBe(true);
  expect(m.rpc).toHaveBeenCalledWith("declarer_reception_loyer",expect.objectContaining({p_cle:cle,p_appel:"appel",p_montant:800,p_reste_attendu:800}));
  expect(m.revalider).toHaveBeenCalledWith("/espace/org");expect(m.revalider).toHaveBeenCalledWith("/agence/org/baux/bail");
  expect(m.revalider).toHaveBeenCalledWith("/espace/org/alertes");
});
it("pas encore reçu n'émet aucun document de paiement et ne solde pas la notification",async()=>{
  const f=form();f.set("reponse","non_recu");m.rpc.mockResolvedValue({data:{statut:"non_recu",bail_id:"bail"},error:null});
  const r=await declarerReceptionLoyer("org","appel",{},f);expect(r.succes).toContain("reste visible");expect(r.termine).not.toBe(true);expect(m.emission).not.toHaveBeenCalled();
  expect(m.rpc).toHaveBeenCalledWith("declarer_reception_loyer",expect.objectContaining({p_montant:null,p_date:null,p_mode:null}));
});
it("ne confirme pas un résultat SQL inconnu ou refusé",async()=>{
  m.rpc.mockResolvedValue({data:null,error:{message:"Le montant a changé"}});
  expect((await declarerReceptionLoyer("org","appel",{},form())).erreur).toContain("montant a changé");expect(m.emission).not.toHaveBeenCalled();
});
it("explique l'annulation sans émettre de quittance ni masquer le loyer restant",async()=>{
  m.rpc.mockResolvedValue({data:{statut:"annule",bail_id:"bail",montant:0},error:null});
  const r=await declarerReceptionLoyer("org","appel",{},form());expect(r.succes).toContain("annulé");expect(r.termine).not.toBe(true);expect(m.emission).not.toHaveBeenCalled();
});
