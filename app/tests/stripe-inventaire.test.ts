import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inventorierSouscriptionsStripe } from "@/lib/stripe-inventaire";
import { ArretSupervision } from "@/lib/controle-effets";
function banc() {
  const rpc = vi.fn(async (nom: string, _params?: Record<string, unknown>): Promise<{data: unknown; error: {message: string} | null}> => ({ data: nom === "stripe_inventaire_prendre" ? { curseur: null, avant_epoch: 123456 } : nom === "stripe_inventaire_page" ? { ecarts: 1 } : true, error: null }));
  const list = vi.fn(async (_params?: Stripe.SubscriptionListParams, _options?: Stripe.RequestOptions) => ({ data: [{ id: "sub_inconnue", customer: "cus_inconnu", status: "active", metadata: { email: "prive@example.invalid" } }], has_more: false }));
  return { rpc, list, db: { rpc } as unknown as SupabaseClient, stripe: { subscriptions: { list } } as unknown as Stripe };
}
describe("inventaire global Stripe", () => {
  it("lit les souscriptions indépendamment des clients connus et ne transmet aucune coordonnée", async () => {
    const b = banc(); const avant = vi.fn(async () => {});
    expect(await inventorierSouscriptionsStripe(b.db, b.stripe, avant)).toEqual({ controles: 1, ecarts: 1, echecs: 0, incomplet: false });
    expect(b.list).toHaveBeenCalledWith({ status: "all", limit: 100, created: { lte: 123456 } }, { timeout: 10000, maxNetworkRetries: 0 });
    const page = b.rpc.mock.calls.find(c => c[0] === "stripe_inventaire_page");
    expect(page).toEqual(["stripe_inventaire_page", expect.objectContaining({ p_curseur: null, p_lignes: [{ souscription: "sub_inconnue", client: "cus_inconnu", statut: "active" }], p_suite: false })]);
    expect(avant).toHaveBeenCalledTimes(3);
  });
  it("reprend le curseur durable puis confirme chaque page, sans repartir au début", async () => {
    const b=banc();
    b.rpc.mockImplementation(async (n: string) => ({ data: n === "stripe_inventaire_prendre" ? { curseur: "sub_precedente", avant_epoch: 123456 } : n === "stripe_inventaire_page" ? { ecarts: 0 } : true, error: null }));
    b.list.mockResolvedValueOnce({ data: [{ id: "sub_suivante", customer: "cus_c", status: "active", metadata: {email:""} }], has_more: true }).mockResolvedValueOnce({ data: [], has_more: false });
    expect(await inventorierSouscriptionsStripe(b.db,b.stripe,async()=>{})).toMatchObject({ controles: 1, incomplet: false });
    expect(b.list.mock.calls[0]).toEqual([expect.objectContaining({ starting_after: "sub_precedente" }), expect.anything()]);
    expect(b.list.mock.calls[1]).toEqual([expect.objectContaining({ starting_after: "sub_suivante" }), expect.anything()]);
  });
  it("borne cinq pages et laisse la suite explicitement en attente", async () => {
    const b=banc(); let n=0;
    b.list.mockImplementation(async()=>({data:[{id:`sub_${++n}`,customer:"cus_c",status:"active",metadata:{email:""}}],has_more:true}));
    expect(await inventorierSouscriptionsStripe(b.db,b.stripe,async()=>{})).toMatchObject({ controles: 5, incomplet: true });
    expect(b.list).toHaveBeenCalledTimes(5);
    expect(b.rpc).toHaveBeenLastCalledWith("stripe_inventaire_liberer", expect.objectContaining({p_erreur:false}));
  });
  it("un contrôle concurrent ne lit pas Stripe", async()=>{
    const b=banc(); b.rpc.mockResolvedValue({data:null,error:null} as never);
    expect(await inventorierSouscriptionsStripe(b.db,b.stripe,async()=>{})).toMatchObject({controles:0,incomplet:true});
    expect(b.list).not.toHaveBeenCalled();
  });
  it.each(["stripe", "base", "page_vide"])("un échec %s ne valide pas un inventaire complet",async(cas)=>{
    const b=banc();
    if(cas==="stripe") b.list.mockRejectedValue(new Error("panne"));
    if(cas==="page_vide") b.list.mockResolvedValue({data:[],has_more:true});
    if(cas==="base") b.rpc.mockImplementation(async(n)=>({data:n==="stripe_inventaire_prendre"?{curseur:null,avant_epoch:123}:true,error:n==="stripe_inventaire_page"?{message:"panne"}:null}) as never);
    expect(await inventorierSouscriptionsStripe(b.db,b.stripe,async()=>{})).toMatchObject({echecs:1,incomplet:true});
    expect(b.rpc).toHaveBeenLastCalledWith("stripe_inventaire_liberer",expect.objectContaining({p_erreur:true}));
  });
  it("un arrêt avant la lecture n’appelle aucun prestataire",async()=>{
    const b=banc(); await expect(inventorierSouscriptionsStripe(b.db,b.stripe,async()=>{throw new ArretSupervision();})).rejects.toBeInstanceOf(ArretSupervision);
    expect(b.rpc).not.toHaveBeenCalled(); expect(b.list).not.toHaveBeenCalled();
  });
  it("un arrêt après lecture libère le verrou sans confirmer la page",async()=>{
    const b=banc();let n=0;
    await expect(inventorierSouscriptionsStripe(b.db,b.stripe,async()=>{if(++n===3)throw new ArretSupervision();})).rejects.toBeInstanceOf(ArretSupervision);
    expect(b.rpc.mock.calls.map(c=>c[0])).toEqual(["stripe_inventaire_prendre","stripe_inventaire_liberer"]);
  });
  it("une libération perdue ne donne pas un bilan vert",async()=>{
    const b=banc();b.rpc.mockImplementation(async(n)=>({data:n==="stripe_inventaire_prendre"?{curseur:null,avant_epoch:123}:n==="stripe_inventaire_page"?{ecarts:0}:false,error:null}) as never);
    expect(await inventorierSouscriptionsStripe(b.db,b.stripe,async()=>{})).toMatchObject({echecs:1,incomplet:true});
  });
  it("une panne réseau pendant la libération conserve l’arrêt de supervision", async()=>{
    const b=banc(); let n=0;
    b.rpc.mockImplementation(async(nom)=>{
      if(nom==="stripe_inventaire_liberer") throw new Error("réseau indisponible");
      return {data:{curseur:null,avant_epoch:123},error:null};
    });
    await expect(inventorierSouscriptionsStripe(b.db,b.stripe,async()=>{if(++n===3)throw new ArretSupervision();})).rejects.toBeInstanceOf(ArretSupervision);
    expect(b.rpc.mock.calls.map(c=>c[0])).toEqual(["stripe_inventaire_prendre","stripe_inventaire_liberer"]);
  });
});
