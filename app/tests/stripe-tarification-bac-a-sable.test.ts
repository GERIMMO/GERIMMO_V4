/** Recette API Stripe TEST uniquement. Pas de navigateur ni webhook public simulé comme réel. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { calculerTarif, GRILLE_PARTICULIERS, TRANCHES_AGENCE, VERSION_TARIFICATION } from "@/lib/tarification";
import { lignesTarifV2, apercuTarifV2, augmenterAbonnementV2, programmerBaisseV2, type ConfigurationV2, type PropositionStripeV2 } from "@/lib/stripe-tarification";
const cle = process.env.GERIMMO_STRIPE_TEST_KEY;
const suivi = { clients: [] as string[], prix: [] as string[], produits: [] as string[], clocks: [] as string[], subs: [] as string[] };
let stripe: Stripe; let config: ConfigurationV2; let customer: string;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function carte(client: string, token = "tok_visa") {
  const pm = await stripe.paymentMethods.create({ type: "card", card: { token } });
  await stripe.paymentMethods.attach(pm.id, { customer: client }); return pm.id;
}
async function horloge() {
  const t = Math.floor(Date.now() / 1000);
  const c = await stripe.testHelpers.testClocks.create({ frozen_time: t, name: "Gerimmo V2 — test uniquement" }); suivi.clocks.push(c.id);
  const client = await stripe.customers.create({ name: "Essai fictif Gerimmo V2", test_clock: c.id }); 
  return { clock: c.id, customer: client.id, maintenant: t };
}
async function avancer(clock: string, frozen_time: number) {
  await stripe.testHelpers.testClocks.advance(clock, { frozen_time });
  for (let i = 0; i < 40; i++) { const c = await stripe.testHelpers.testClocks.retrieve(clock); if (c.status === "ready") return; await sleep(1000); }
  throw new Error("L’horloge Stripe de test n’a pas terminé son avance.");
}
function proposition(volume: number, periodicite: "mensuel" | "annuel", lignes: { price: string; quantity: number }[]): PropositionStripeV2 {
  const t = calculerTarif("proprietaire_direct", volume, periodicite);
  return { version: VERSION_TARIFICATION, public_tarif: "proprietaire_direct", volume_source: 1, volume_cible: volume, capacite: t.capacite,
    formule: t.formule, periodicite, montant_centimes: t.montantCentimes, total_centimes: t.montantCentimes, taxe_centimes: 0, prorata_centimes: 0,
    date_effet: new Date().toISOString(), type: "augmentation", revision_abonnement: "recette", stripe_customer_id: customer, stripe_subscription_id: null,
    stripe_lignes: lignes, stripe_proration_date: Math.floor(Date.now() / 1000), fiscalite: { mode: "exonere", mention: "Scénario de test sans taxe ; ne décrit pas le régime réel" },
    essai_fin: null, empreinte_stripe: null, acteur_id: "recette" };
}
describe.skipIf(!cle)("nouvelle grille : factures et échéances Stripe de TEST", () => {
  beforeAll(async () => {
    if (!/^(sk|rk)_test_/.test(cle ?? "")) throw new Error("Une clé Stripe de TEST est obligatoire.");
    stripe = new Stripe(cle!, { maxNetworkRetries: 1, timeout: 20000 });
    config = { cle: cle!, reel: false, catalogue: {}, fiscalite: { mode: "exonere", mention: "Scénario de test sans taxe" } };
    const prod = await stripe.products.create({ name: "Gerimmo — recette nouvelle grille", metadata: { usage: "test", tarification_version: VERSION_TARIFICATION } });
    expect(prod.livemode).toBe(false); suivi.produits.push(prod.id);
    for (const offre of GRILLE_PARTICULIERS) for (const per of ["mensuel", "annuel"] as const) {
      const p = await stripe.prices.create({ product: prod.id, currency: "eur", unit_amount: per === "annuel" ? offre.annuelCentimes : offre.mensuelCentimes,
        tax_behavior: "inclusive", recurring: { interval: per === "annuel" ? "year" : "month" } }); suivi.prix.push(p.id); config.catalogue[`${offre.formule}_${per}`] = p.id;
    }
    for (const per of ["mensuel", "annuel"] as const) {
      const p = await stripe.prices.create({ product: prod.id, currency: "eur", unit_amount: per === "annuel" ? 1000 : 100,
        tax_behavior: "inclusive", recurring: { interval: per === "annuel" ? "year" : "month" } }); suivi.prix.push(p.id); config.catalogue[`supplement_${per}`] = p.id;
    }
    const p = await stripe.prices.create({ product: prod.id, currency: "eur", tax_behavior: "exclusive", recurring: { interval: "month" }, billing_scheme: "tiered", tiers_mode: "graduated",
      tiers: TRANCHES_AGENCE.map(t => ({ up_to: t.jusqua ?? "inf", flat_amount: t.forfaitCentimes, unit_amount: t.unitaireCentimes })) });
    suivi.prix.push(p.id); config.catalogue.agence_mensuel = p.id;
    customer = (await stripe.customers.create({ name: "Recette montants Gerimmo V2" })).id; suivi.clients.push(customer);
  }, 120000);
  afterAll(async () => {
    if (!stripe) return;
    const erreurs: string[] = [];
    const nettoyer = async (label: string, action: () => Promise<unknown>) => { try { await action(); } catch { erreurs.push(label); } };
    for (const id of suivi.subs) await nettoyer("souscription", async () => { const s = await stripe.subscriptions.retrieve(id); if (s.status !== "canceled") await stripe.subscriptions.cancel(id); });
    // Supprimer une horloge supprime les clients qui lui sont rattachés.
    for (const id of suivi.clocks) await nettoyer("horloge", () => stripe.testHelpers.testClocks.del(id));
    for (const id of suivi.clients) await nettoyer("client", async () => { const c = await stripe.customers.retrieve(id); if (!c.deleted) await stripe.customers.del(id); });
    for (const id of suivi.prix) await nettoyer("prix", () => stripe.prices.update(id, { active: false }));
    for (const id of suivi.produits) await nettoyer("produit", () => stripe.products.update(id, { active: false }));
    if (erreurs.length) throw new Error(`Nettoyage de test incomplet : ${erreurs.join(", ")}`);
  }, 120000);
  it("tous les seuils particuliers sont facturés aux montants affichés, au mois et à l’année", async () => {
    for (const per of ["mensuel", "annuel"] as const) for (const n of [0, 1, 2, 3, 4, 10, 11, 20, 21, 25]) {
      const { lignes, fiscalite, tarif } = await lignesTarifV2(stripe, config, "proprietaire_direct", n, per);
      const preview = await apercuTarifV2(stripe, { customer, lignes, fiscalite }); expect(preview.total).toBe(tarif.montantCentimes); expect(preview.taxe).toBe(0);
    }
  }, 120000);
  it("toutes les tranches agences restent progressives, même à zéro lot", async () => {
    for (const n of [0, 10, 11, 20, 50, 51, 100, 200, 201, 300, 500]) {
      const { lignes, fiscalite, tarif } = await lignesTarifV2(stripe, config, "agence", n, "mensuel");
      expect((await apercuTarifV2(stripe, { customer, lignes, fiscalite })).total).toBe(tarif.montantCentimes);
    }
  }, 120000);
  it("préserve l’essai court, prélève et renouvelle l’année, puis résilie à l’échéance", async () => {
    const h = await horloge(); const pm = await carte(h.customer);
    const s = await stripe.subscriptions.create({ customer: h.customer, default_payment_method: pm, trial_end: h.maintenant + 3600,
      items: [{ price: config.catalogue.solo_annuel, quantity: 1 }], metadata: { tarification_version: VERSION_TARIFICATION } });
    suivi.subs.push(s.id); expect(s.status).toBe("trialing"); expect(s.trial_end).toBe(h.maintenant + 3600);
    await avancer(h.clock, h.maintenant + 3600 + 10);
    await avancer(h.clock, h.maintenant + 3600 + 7200);
    const factures = await stripe.invoices.list({ customer: h.customer, subscription: s.id });
    expect(factures.data.some(f => f.total === 5990 && f.status === "paid")).toBe(true);
    const actif = await stripe.subscriptions.retrieve(s.id); expect(actif.items.data[0].price.recurring?.interval).toBe("year");
    const premiereFin = actif.items.data[0].current_period_end;
    await avancer(h.clock, premiereFin + 10);
    await avancer(h.clock, premiereFin + 7200);
    const renouvellement = await stripe.invoices.list({ customer: h.customer, subscription: s.id });
    expect(renouvellement.data.filter(f => f.total === 5990 && f.status === "paid")).toHaveLength(2);
    const annule = await stripe.subscriptions.update(s.id, { cancel_at_period_end: true });
    expect(annule.status).toBe("active"); expect(annule.cancel_at_period_end).toBe(true);
    await avancer(h.clock, annule.items.data[0].current_period_end + 10);
    expect((await stripe.subscriptions.retrieve(s.id)).status).toBe("canceled");
  }, 180000);
  it("hausse avec le prorata présenté puis baisse programmée à l’échéance", async () => {
    const h = await horloge(); const pm = await carte(h.customer);
    const s = await stripe.subscriptions.create({ customer: h.customer, default_payment_method: pm,
      items: [{ price: config.catalogue.solo_mensuel, quantity: 1 }], metadata: { tarification_version: VERSION_TARIFICATION }, payment_behavior: "error_if_incomplete" });
    suivi.subs.push(s.id); const fin = s.items.data[0].current_period_end;
    await avancer(h.clock, h.maintenant + 10 * 86400);
    const p = proposition(3, "mensuel", [{ price: config.catalogue.bailleur_mensuel, quantity: 1 }]); p.stripe_proration_date = h.maintenant + 10 * 86400;
    const actuel = await stripe.subscriptions.retrieve(s.id);
    const preview = await apercuTarifV2(stripe, { customer: h.customer, lignes: p.stripe_lignes, fiscalite: p.fiscalite, abonnement: actuel, prorationDate: p.stripe_proration_date });
    expect(preview.prorata).toBeGreaterThan(0);
    const augmente = await augmenterAbonnementV2(stripe, actuel, p, "org-recette", randomUUID());
    expect(augmente.pending_update).toBeNull(); expect(augmente.items.data[0].price.id).toBe(config.catalogue.bailleur_mensuel);
    const invoice = typeof augmente.latest_invoice === "string" ? await stripe.invoices.retrieve(augmente.latest_invoice) : augmente.latest_invoice;
    expect(invoice?.amount_due).toBe(preview.prorata);
    const baisse = proposition(1, "mensuel", [{ price: config.catalogue.solo_mensuel, quantity: 1 }]);
    await programmerBaisseV2(stripe, augmente, baisse, "org-recette", randomUUID());
    expect((await stripe.subscriptions.retrieve(s.id)).items.data[0].price.id).toBe(config.catalogue.bailleur_mensuel);
    await avancer(h.clock, fin + 10);
    expect((await stripe.subscriptions.retrieve(s.id)).items.data[0].price.id).toBe(config.catalogue.solo_mensuel);
  }, 120000);
  it("une hausse refusée par la banque ne donne pas la nouvelle formule", async () => {
    const client = await stripe.customers.create({ name: "Recette refus hausse V2" }); suivi.clients.push(client.id);
    const pm = await carte(client.id);
    const s = await stripe.subscriptions.create({ customer: client.id, default_payment_method: pm, items: [{ price: config.catalogue.solo_mensuel, quantity: 1 }], payment_behavior: "error_if_incomplete", metadata: { tarification_version: VERSION_TARIFICATION } }); suivi.subs.push(s.id);
    // Carte officielle Stripe qui accepte le rattachement puis refuse le débit.
    // https://docs.stripe.com/testing#declined-payments
    const refuse = await carte(client.id, "tok_chargeCustomerFail"); await stripe.subscriptions.update(s.id, { default_payment_method: refuse });
    const p = proposition(10, "mensuel", [{ price: config.catalogue.investisseur_mensuel, quantity: 1 }]);
    const r = await augmenterAbonnementV2(stripe, await stripe.subscriptions.retrieve(s.id), p, "org-recette", randomUUID());
    expect(r.pending_update).not.toBeNull(); expect(r.items.data[0].price.id).toBe(config.catalogue.solo_mensuel);
  }, 60000);
});
