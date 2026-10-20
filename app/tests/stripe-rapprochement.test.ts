import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { comparerAbonnementStripe, rapprocherAbonnementsStripe, type SuiviControleStripe } from "@/lib/stripe-rapprochement";
import { ArretSupervision } from "@/lib/controle-effets";
const suivi: SuiviControleStripe = { organization_id: "org", stripe_customer_id: "cus_test", stripe_subscription_id: "sub_test", stripe_statut: "active", quantite: 1, montant_periode_cents: "599", periodicite: "mensuel", periode_fin: null, annulation_demandee: false, premiere_facture_payee: true };
const sub = { id: "sub_test", customer: "cus_test", status: "active", cancel_at_period_end: false, metadata: { gerimmo_grille: "2026-09-28" }, items: { data: [{ quantity: 1, price: { unit_amount: 599, recurring: { interval: "month" } } }] } };
function stripe(options: { abonnement?: unknown; factures?: unknown[]; plus?: boolean } = {}) {
  return { subscriptions: { list: vi.fn(async () => ({ data: [options.abonnement ?? sub], has_more: options.plus ?? false })), retrieve: vi.fn(async () => sub) }, invoices: { list: vi.fn(async () => ({ data: options.factures ?? [], has_more: false })) } } as unknown as Stripe;
}
describe("Rapprochement Stripe sans écriture chez le prestataire", () => {
  it("ne signale pas de différence quand les données concordent", async () => { expect(await comparerAbonnementStripe(stripe(), suivi)).toEqual([]); });
  it("repère un statut divergent et une facture payée non reportée", async () => {
    expect(await comparerAbonnementStripe(stripe({ abonnement: { ...sub, status: "past_due" }, factures: [{ amount_paid: 599 }] }), { ...suivi, premiere_facture_payee: false })).toEqual(["statut", "facture_non_reportee"]);
  });
  it("une facture nulle ne déclenche pas une correction du premier paiement", async () => {
    expect(await comparerAbonnementStripe(stripe({ factures: [{ amount_paid: 0 }] }), { ...suivi, premiere_facture_payee: false })).toEqual([]);
  });
  it("ne présente pas une page Stripe partielle comme un contrôle complet", async () => { expect(await comparerAbonnementStripe(stripe({ plus: true }), suivi)).toContain("lecture_incomplete"); });
  it("signale une souscription active inconnue du suivi", async () => { expect(await comparerAbonnementStripe(stripe(), { ...suivi, stripe_subscription_id: null })).toContain("souscription_non_suivie"); });
  it("borne un passage et annonce le reliquat", async () => {
    const rpc = vi.fn(async (nom: string) => ({ data: nom === "stripe_controles_a_faire" ? Array.from({ length: 21 }, (_, i) => ({ ...suivi, organization_id: `org_${i}` })) : null, error: null }));
    const s = stripe(); const r = await rapprocherAbonnementsStripe({ rpc } as unknown as SupabaseClient, s, async () => {});
    expect(r).toEqual({ controles: 20, ecarts: 0, echecs: 0, incomplet: true }); expect(s.subscriptions.list).toHaveBeenCalledTimes(20);
  });
  it("respecte un arrêt avant toute lecture externe et tout enregistrement", async () => {
    const rpc = vi.fn(async () => ({ data: [suivi], error: null })); const s = stripe();
    await expect(rapprocherAbonnementsStripe({ rpc } as unknown as SupabaseClient, s, async () => { throw new ArretSupervision(); })).rejects.toBeInstanceOf(ArretSupervision);
    expect(s.subscriptions.list).not.toHaveBeenCalled(); expect(rpc).toHaveBeenCalledOnce();
  });
  it("ne transforme pas un échec d’écriture en succès du contrôle", async () => {
    const rpc = vi.fn(async (nom: string) => ({ data: nom === "stripe_controles_a_faire" ? [suivi] : null, error: nom === "stripe_controle_enregistrer" ? { message: "panne" } : null }));
    await expect(rapprocherAbonnementsStripe({ rpc } as unknown as SupabaseClient, stripe(), async () => {})).rejects.toThrow("enregistré");
  });
});
