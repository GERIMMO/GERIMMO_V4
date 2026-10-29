import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { ArretSupervision } from "@/lib/controle-effets";
import { protegerClientAutomatique } from "@/lib/client-automatique";
import { crediterClientStripe, synchroniserQuantite } from "@/lib/stripe";
import { programmerEcheance } from "@/lib/stripe-offres";
import { offreParticulier } from "@/lib/tarifs";

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
      subscriptions: { retrieve: async () => ({ id: "sub_test", schedule: null, metadata: { gerimmo_formule: "solo", gerimmo_unites: "1" }, items: { data: [{ quantity: 1, price: { unit_amount: 599, recurring: { interval: "month" } } }] } }) },
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

});
