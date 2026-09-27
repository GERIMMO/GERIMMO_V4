/** node --experimental-strip-types scripts/stripe-catalogue-test.mjs --creer
 * Crée uniquement des objets Stripe TEST. N’écrit jamais de clé ni de configuration réelle. */
import Stripe from "stripe";
import { GRILLE_PARTICULIERS, TRANCHES_AGENCE, VERSION_TARIFICATION } from "../src/lib/tarification.ts";
const cle = process.env.GERIMMO_STRIPE_TEST_KEY ?? "";
if (!/^(sk|rk)_test_/.test(cle)) throw new Error("Une clé de TEST GERIMMO_STRIPE_TEST_KEY est obligatoire.");
if (!process.argv.includes("--creer")) throw new Error("Ajoutez --creer pour autoriser la création du catalogue de TEST.");
const stripe = new Stripe(cle);
const product = await stripe.products.create({ name: "Gerimmo — nouvelle grille TEST", metadata: { tarification_version: VERSION_TARIFICATION, usage: "test_uniquement" } });
const catalogue = {};
for (const offre of GRILLE_PARTICULIERS) {
  for (const periodicite of ["mensuel", "annuel"]) {
    const p = await stripe.prices.create({ product: product.id, currency: "eur", unit_amount: periodicite === "annuel" ? offre.annuelCentimes : offre.mensuelCentimes,
      recurring: { interval: periodicite === "annuel" ? "year" : "month" }, tax_behavior: "inclusive", metadata: { tarification_version: VERSION_TARIFICATION } });
    catalogue[`${offre.formule}_${periodicite}`] = p.id;
  }
}
for (const periodicite of ["mensuel", "annuel"]) {
  const p = await stripe.prices.create({ product: product.id, currency: "eur", unit_amount: periodicite === "annuel" ? 1000 : 100,
    recurring: { interval: periodicite === "annuel" ? "year" : "month" }, tax_behavior: "inclusive" });
  catalogue[`supplement_${periodicite}`] = p.id;
}
const agence = await stripe.prices.create({ product: product.id, currency: "eur", recurring: { interval: "month" }, billing_scheme: "tiered", tiers_mode: "graduated", tax_behavior: "exclusive",
  tiers: TRANCHES_AGENCE.map(t => ({ up_to: t.jusqua ?? "inf", unit_amount: t.unitaireCentimes, flat_amount: t.forfaitCentimes })) });
catalogue.agence_mensuel = agence.id;
const portail = await stripe.billingPortal.configurations.create({ business_profile: { headline: "Facturation Gerimmo — test" }, features: {
  customer_update: { enabled: true, allowed_updates: ["address", "email", "name", "tax_id"] }, invoice_history: { enabled: true }, payment_method_update: { enabled: true },
  subscription_update: { enabled: false }, subscription_cancel: { enabled: true, mode: "at_period_end" } } });
console.log(JSON.stringify({ mode: "TEST", product: product.id, STRIPE_CATALOGUE_V2_JSON: catalogue, STRIPE_PORTAIL_V2_CONFIGURATION: portail.id,
  suite: "Renseigner séparément STRIPE_FISCALITE_V2_JSON selon le scénario de test. Ne pas activer la production." }, null, 2));
