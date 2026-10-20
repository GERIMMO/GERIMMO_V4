import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
const m = vi.hoisted(() => ({ traiter: vi.fn() }));
vi.mock("@/lib/stripe-evenements", () => ({ traiterEvenementStripe: m.traiter }));
import { executerEvenementStripe, reprendreEvenementsStripe } from "@/lib/stripe-file";
import { bilanMission } from "@/lib/missions";
const evenement = { id: "evt_test", type: "customer.subscription.updated", data: { object: { id: "sub_test", customer: "cus_test" } } } as Stripe.Event;
beforeEach(() => { vi.clearAllMocks(); m.traiter.mockResolvedValue({ reponse: {} }); });
describe("Traitement durable des événements", () => {
  it.each(["occupe", "attendre", "traite"])("une réception %s ne traite rien", async etat => {
    const rpc = vi.fn(async () => ({ data: etat, error: null }));
    expect((await executerEvenementStripe({ rpc } as unknown as SupabaseClient, {} as Stripe, evenement)).etat).toBe(etat);
    expect(m.traiter).not.toHaveBeenCalled();
  });
  it("conserve une erreur, au lieu d’effacer la réception", async () => {
    const rpc = vi.fn(async (n: string) => ({ data: n === "stripe_evenement_prendre" ? "pris" : true, error: null }));
    m.traiter.mockRejectedValue(new Error("panne"));
    await expect(executerEvenementStripe({ rpc } as unknown as SupabaseClient, {} as Stripe, evenement)).rejects.toThrow("panne");
    expect(rpc).toHaveBeenLastCalledWith("stripe_evenement_finir", expect.objectContaining({ p_reussi: false }));
    expect(rpc.mock.calls.some(([n]) => n.includes("rejouable"))).toBe(false);
  });
  it("ne confirme pas un traitement dont le verrou a été perdu avant la fin", async () => {
    const rpc = vi.fn(async (n: string) => ({ data: n === "stripe_evenement_prendre" ? "pris" : false, error: null }));
    await expect(executerEvenementStripe({ rpc } as unknown as SupabaseClient, {} as Stripe, evenement)).rejects.toThrow("vérifiée");
  });
  it("fait vérifier le verrou dans la transaction de chaque écriture métier", async () => {
    const rpc = vi.fn(async (n: string) => ({ data: n === "stripe_evenement_prendre" ? "pris" : true, error: null }));
    m.traiter.mockImplementation(async db => { await db.rpc("abonnement_appliquer", { p_customer: "cus_test" }); return { reponse: {} }; });
    await executerEvenementStripe({ rpc } as unknown as SupabaseClient, {} as Stripe, evenement);
    expect(rpc).toHaveBeenCalledWith("stripe_evenement_appliquer", expect.objectContaining({ p_event_id: "evt_test", p_jeton: expect.any(String), p_action: "abonnement_appliquer", p_params: { p_customer: "cus_test" } }));
  });
  it("dix anciennes références indisponibles ne bloquent pas la onzième à la passe suivante", async () => {
    const anciennes = Array.from({ length: 10 }, (_, i) => ({ stripe_event_id: `evt_ancien_${i}`, type: evenement.type, charge: null }));
    const reportees = new Set<string>(); let passages = 0;
    const q = { select: () => q, is: () => q, lte: () => q, lt: () => q, order: () => q,
      limit: async () => ({ data: ++passages === 1 ? anciennes : [{ stripe_event_id: evenement.id, type: evenement.type, charge: { objet: "sub_test", client: "cus_test" } }], error: null }) };
    const rpc = vi.fn(async (nom: string, args: Record<string, unknown>) => {
      if (nom === "stripe_evenement_lecture_differee") { reportees.add(args.p_event_id as string); expect(args.p_definitif).toBe(true); }
      return { data: nom === "stripe_evenement_prendre" ? "pris" : true, error: null };
    });
    const db = { from: () => q, rpc } as unknown as SupabaseClient;
    const stripe = { events: { retrieve: vi.fn(async () => { throw Object.assign(new Error("absent"), { code: "resource_missing" }); }) } } as unknown as Stripe;
    expect((await reprendreEvenementsStripe(db, stripe, async () => {})).echecs).toBe(10); expect(reportees.size).toBe(10);
    expect((await reprendreEvenementsStripe(db, stripe, async () => {})).repris).toBe(1);
  });
  it("le compte rendu ne classe pas une panne de rapprochement comme une réussite", () => {
    expect(bilanMission({ echecs: [], stripe_echecs: 1, stripe_ecarts: 0 }, 200).ok).toBe(false);
    expect(bilanMission({ echecs: [], stripe_echecs: 0, stripe_incomplet: true }, 200).ok).toBe(false);
  });
});
