import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({rpc:m.rpc})}));
import { InventaireStripe } from "@/app/admin/sante/inventaire-stripe";
import { SuiviStripe } from "@/app/admin/sante/controle-stripe";
describe("inventaire Stripe dans Santé",()=>{
  it("un inventaire interrompu présente ses écarts sans annoncer un contrôle complet",async()=>{
    m.rpc.mockResolvedValue({data:{lus:100,ecarts:51,incomplet:true,erreur:true,debut_le:"2026-10-23T06:00:00Z",complet_le:null,passage_le:"2026-10-23T06:00:01Z",dossiers:[{souscription:"sub_fictive",client:"cus_fictif",motif:"client_absent",verifie_le:"2026-10-23T06:00:01Z"}]},error:null});
    const html=renderToStaticMarkup(await InventaireStripe());
    expect(html).toContain("51 rattachements à vérifier");
    expect(html).toContain("Le contrôle a été interrompu");
    expect(html).toContain("Inventaire en cours");
    expect(html).toContain("pas encore terminé");
    expect(html).toContain("Client Stripe absent de Gerimmo");
    expect(html).toContain("sub_fictive");
    expect(html).toContain("sur 51");
  });
  it("un registre indisponible ne devient pas zéro anomalie",async()=>{
    m.rpc.mockResolvedValue({data:null,error:{message:"indisponible"}});
    expect(renderToStaticMarkup(await InventaireStripe())).toContain("L’inventaire global est indisponible");
  });
  it("le chargement du bilan global ne masque pas les contrôles déjà connus",()=>{
    m.rpc.mockImplementation(()=>new Promise(()=>{}));
    const html=renderToStaticMarkup(createElement(SuiviStripe,{controle:{en_attente:0,a_reprendre:0,a_controler:0,ecarts:0,dossiers:[]}}));
    expect(html).toContain("Chargement de l’inventaire Stripe");
    expect(html).toContain("Stripe");
  });
});
