import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArretSupervision } from "@/lib/controle-effets";
import { protegerClientAutomatique } from "@/lib/client-automatique";
import { crediterClientStripe, synchroniserQuantite } from "@/lib/stripe";
import { programmerEcheance } from "@/lib/stripe-offres";
import { offreParticulier } from "@/lib/tarifs";
import { traiterEvenementSignature } from "@/lib/signature-worker";
import type { ConfigurationYoutrust } from "@/lib/youtrust";

describe("Un arrêt reste distinct d’une erreur fournisseur", () => {
  it("Stripe : conserve le premier effet et bloque le second en propageant l’arrêt", async () => {
    const update = vi.fn(async () => ({}));
    let controles = 0;
    const arret = new ArretSupervision();
    const stripe = protegerClientAutomatique({ subscriptions: {
      retrieve: vi.fn(async () => ({ cancel_at_period_end: true, items: { data: [{ id: "item_test", quantity: 1 }] } })),
      update,
    } }, async () => { if (++controles === 2) throw arret; });
    await expect(synchroniserQuantite(stripe as unknown as Stripe, { subscription: "sub_test", quantite: 2 })).rejects.toBe(arret);
    expect(update).toHaveBeenCalledExactlyOnceWith("sub_test", { cancel_at_period_end: false });
    expect(controles).toBe(2);
  });

  it("un avoir bloqué par une panne du contrôle conserve cette raison", async () => {
    const createBalanceTransaction = vi.fn();
    const arret = new ArretSupervision(undefined, "indisponible");
    const stripe = protegerClientAutomatique({ customers: { createBalanceTransaction } }, async () => { throw arret; });
    await expect(crediterClientStripe(stripe as unknown as Stripe, { customer: "cus_test", montantCents: 20, avantageId: "test", libelle: "TEST" })).rejects.toBe(arret);
    expect(createBalanceTransaction).not.toHaveBeenCalled();
  });

  it("la création d’un échéancier bloquée remonte hors de son adaptateur", async () => {
    const create = vi.fn();
    const arret = new ArretSupervision();
    const stripe = protegerClientAutomatique({
      subscriptions: { retrieve: async () => ({ id: "sub_test", schedule: null, metadata: {} }) },
      products: { retrieve: async () => ({ id: "produit_test", active: true }) },
      subscriptionSchedules: { create },
    }, async () => { throw arret; });
    await expect(programmerEcheance(stripe as unknown as Stripe, { subscription: "sub_test", offre: offreParticulier(1, "mensuel"), regime: { nature: "franchise" }, orgId: "org_test" })).rejects.toBe(arret);
    expect(create).not.toHaveBeenCalled();
  });

  it("une erreur Stripe ordinaire garde le résultat d’échec habituel", async () => {
    const stripe = { subscriptions: { retrieve: async () => { throw new Error("panne fournisseur"); } } };
    await expect(synchroniserQuantite(stripe as unknown as Stripe, { subscription: "sub_test", quantite: 2 })).resolves.toMatchObject({ ok: false, erreur: expect.any(String) });
  });

  function signature() {
    const updates: unknown[] = [];
    const rpc = vi.fn(async () => ({ error: null }));
    const db = { rpc, from: (table: string) => table === "demandes_signature"
      ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { organization_id: "org_test", signee_le: null, external_document_id: "doc_test", external_signer_id: "sign_test" }, error: null }) }) }) }
      : { update: (d: unknown) => { updates.push(d); return { eq: async () => ({ error: null }) }; } } };
    return { db: db as unknown as SupabaseClient, updates, rpc };
  }

  it.each(["signature_request.done", "signature_request.declined", "signature_request.expired"])("%s : arrêt avant effet, sans classement ni tentative consommée", async (event_name) => {
    const { db, updates, rpc } = signature();
    const arret = new ArretSupervision();
    await expect(traiterEvenementSignature(db, {} as ConfigurationYoutrust, { event_id: "event_test", event_name, request_id: "req_test", tentatives: 2 }, async () => { throw arret; })).rejects.toBe(arret);
    expect(updates).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("une erreur ordinaire de signature conserve sa tentative et son motif", async () => {
    const { db, updates } = signature();
    await expect(traiterEvenementSignature(db, {} as ConfigurationYoutrust, { event_id: "event_test", event_name: "signature_request.done", request_id: "req_test", tentatives: 2 }, async () => { throw new Error("source indisponible"); })).resolves.toEqual({ ok: false, erreur: "source indisponible" });
    expect(updates).toEqual([{ etat: "echec", erreur: "source indisponible", tentatives: 3 }]);
  });
});
