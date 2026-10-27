import { describe, it, expect, vi } from "vitest";
import type Stripe from "stripe";
import { appliquerCreditOffert, type CreditOffert } from "@/lib/mois-offerts-stripe";
const cadeau: CreditOffert = { id:"cadeau-unique", organization_id:"org", mois:2, montant_cents:1200, client_stripe:"cus_test", abonnement_stripe:"sub_test", cree_le:new Date().toISOString() };
function faux(options: { preuve?: boolean; ancienMontant?: number; annuel?: boolean; autreClient?: boolean } = {}) {
 return { customers: {
  retrieve: vi.fn(async () => ({ metadata: { organization_id:options.autreClient ? "autre" : "org" } })),
  listBalanceTransactions: vi.fn(() => (async function* () { if(options.preuve) yield { id:"cbtxn_preuve",metadata:{gerimmo_cadeau:cadeau.id},amount:options.ancienMontant ?? -1200,currency:"eur" }; })()),
  createBalanceTransaction: vi.fn(async () => ({ id:"cbtxn_nouveau" })),
 }, subscriptions: { retrieve: vi.fn(async () => ({ customer:"cus_test",status:"active",items:{data:[{quantity:1,price:{unit_amount:options.annuel ? 7200 : 600,currency:"eur",billing_scheme:"per_unit",recurring:{interval:options.annuel ? "year" : "month",interval_count:1}}}]}})) } };
}
describe("mois offerts : crédit uniquement futur, reprise sans doublon", () => {
 it("crédite deux mois au tarif courant sans remboursement ni changement de souscription", async () => {
  const s=faux(); expect(await appliquerCreditOffert(s as unknown as Stripe,cadeau)).toBe("cbtxn_nouveau");
  expect(s.customers.createBalanceTransaction).toHaveBeenCalledWith("cus_test",expect.objectContaining({amount:-1200,currency:"eur",metadata:{gerimmo_cadeau:"cadeau-unique"}}),{idempotencyKey:"gerimmo-mois-offerts-cadeau-unique"});
 });
 it("convertit l’abonnement annuel en mois",async()=>{const s=faux({annuel:true});await appliquerCreditOffert(s as unknown as Stripe,cadeau);expect(s.customers.createBalanceTransaction).toHaveBeenCalledOnce();});
 it("retrouve un crédit même après expiration de la clé d’idempotence",async()=>{const s=faux({preuve:true});expect(await appliquerCreditOffert(s as unknown as Stripe,{...cadeau,cree_le:"2020-01-01"})).toBe("cbtxn_preuve");expect(s.customers.createBalanceTransaction).not.toHaveBeenCalled();});
 it("ne recrée jamais un crédit ancien sans preuve",async()=>{const s=faux();await expect(appliquerCreditOffert(s as unknown as Stripe,{...cadeau,cree_le:"2020-01-01"})).rejects.toThrow("20 heures");expect(s.customers.createBalanceTransaction).not.toHaveBeenCalled();});
 it("refuse le client d’une autre organisation",async()=>{const s=faux({autreClient:true});await expect(appliquerCreditOffert(s as unknown as Stripe,cadeau)).rejects.toThrow();expect(s.customers.createBalanceTransaction).not.toHaveBeenCalled();});
 it("refuse un tarif changé depuis confirmation",async()=>{const s=faux();await expect(appliquerCreditOffert(s as unknown as Stripe,{...cadeau,montant_cents:1400})).rejects.toThrow("diffère");expect(s.customers.createBalanceTransaction).not.toHaveBeenCalled();});
 it("refuse une preuve de montant incohérent",async()=>{const s=faux({preuve:true,ancienMontant:-600});await expect(appliquerCreditOffert(s as unknown as Stripe,cadeau)).rejects.toThrow("ne correspond pas");expect(s.customers.createBalanceTransaction).not.toHaveBeenCalled();});
});
