/** API Stripe de TEST → route locale signée → vraies règles PostgreSQL jetables.
 * La livraison HTTP publique de Stripe n’est pas simulée comme une recette de production. */
import { randomUUID, randomBytes } from "node:crypto";
import Stripe from "stripe";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { calculerTarif, VERSION_TARIFICATION } from "@/lib/tarification";
import { augmenterAbonnementV2, type PropositionStripeV2 } from "@/lib/stripe-tarification";
const transport = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ rpc: transport.rpc }) }));
vi.mock("@/lib/relances-paiement", () => ({ envoyerRelancesDues: async () => ({ envoyees: 0 }) }));
import { POST } from "@/app/api/stripe/webhook/route";
const cle = process.env.GERIMMO_STRIPE_TEST_KEY;
const secret = `whsec_${randomBytes(24).toString("hex")}`;
let stripe: Stripe; let db: Client; let org: string; let acteur: string; let customer: string; let product: string;
let prixSolo: string; let prixBailleur: string; let abonnement: string; let propositionId: string; let snapshot: PropositionStripeV2;
const prixCrees: string[] = [];
async function creerProposition(volume: number, type: "souscription" | "augmentation") {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: acteur, role: "authenticated" })]);
  await db.query("set local role authenticated");
  const c = (await db.query("select public.lire_abonnement_v2($1) c", [org])).rows[0].c;
  await db.query("reset role");
  const t = calculerTarif("proprietaire_direct", volume, "mensuel");
  const p: PropositionStripeV2 = { version: VERSION_TARIFICATION, public_tarif: "proprietaire_direct", volume_source: 0,
    volume_cible: volume, capacite: t.capacite, formule: t.formule, periodicite: "mensuel", montant_centimes: t.montantCentimes,
    total_centimes: t.montantCentimes, taxe_centimes: 0, prorata_centimes: 0, date_effet: new Date().toISOString(), type,
    revision_abonnement: c.revision_abonnement, stripe_customer_id: customer, stripe_subscription_id: c.stripe_subscription_id,
    stripe_lignes: [{ price: volume === 1 ? prixSolo : prixBailleur, quantity: 1 }], stripe_proration_date: Math.floor(Date.now() / 1000),
    fiscalite: { mode: "exonere", mention: "Scénario de test sans taxe" }, essai_fin: null, empreinte_stripe: null, acteur_id: acteur };
  const id = (await db.query("select public.enregistrer_proposition_abonnement_v2($1,$2,$3,now()+interval '15 minutes') id", [org, acteur, p])).rows[0].id;
  await db.query("set local role authenticated"); await db.query("select public.consentir_proposition_abonnement_v2($1)", [id]); await db.query("reset role");
  return { id: id as string, snapshot: p };
}
async function livrer(s: Stripe.Subscription, type = "customer.subscription.updated", id = `evt_recette_v2_${randomUUID()}`) {
  const corps = JSON.stringify({ id, object: "event", type, livemode: false, data: { object: s } });
  const r = await POST(new Request("http://localhost:3100/api/stripe/webhook", { method: "POST", body: corps,
    headers: { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload: corps, secret }) } }));
  const data = await r.json();
  if (r.status !== 200) throw new Error(`Route signée : ${r.status} ${JSON.stringify(data)}`);
  return data;
}
describe.skipIf(!cle)("API Stripe V2 et confirmation SQL réelle", () => {
  beforeAll(async () => {
    if (!/^(sk|rk)_test_/.test(cle ?? "")) throw new Error("Une clé Stripe de TEST est obligatoire.");
    const u = new URL(process.env.SUPABASE_DB_URL ?? "");
    if (!["localhost", "127.0.0.1"].includes(u.hostname) || !u.pathname.startsWith("/gerimmo_ci_") || u.search) throw new Error("Base locale jetable obligatoire.");
    stripe = new Stripe(cle!, { maxNetworkRetries: 1, timeout: 20000 }); db = new Client({ connectionString: u.toString() }); await db.connect(); await db.query("begin");
    acteur = (await db.query(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current)
      values('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated','recette-v2-'||gen_random_uuid()||'@test.local','x',now(),'{}','{}',now(),now(),'','','','','') returning id`)).rows[0].id;
    org = (await db.query("insert into public.organizations(name,type,tarification_version) values('Recette paiement fictive','proprietaire_direct','2026-09-v2') returning id")).rows[0].id;
    await db.query("insert into public.memberships(organization_id,account_id,role) values($1,$2,'proprietaire_direct')", [org, acteur]);
    customer = (await stripe.customers.create({ name: "Gerimmo — recette V2 SQL fictive" })).id;
    await db.query("select public.abonnement_v2_poser_client($1,$2)", [org, customer]);
    product = (await stripe.products.create({ name: "Gerimmo V2 — test de confirmation SQL" })).id;
    for (const amount of [599, 999]) {
      const p = await stripe.prices.create({ product, unit_amount: amount, currency: "eur", tax_behavior: "inclusive", recurring: { interval: "month" } });
      expect(p.livemode).toBe(false); prixCrees.push(p.id); if (amount === 599) prixSolo = p.id; else prixBailleur = p.id;
    }
    vi.stubEnv("STRIPE_SECRET_KEY", cle!); vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    vi.stubEnv("STRIPE_CATALOGUE_V2_JSON", JSON.stringify({ solo_mensuel: prixSolo, bailleur_mensuel: prixBailleur }));
    vi.stubEnv("STRIPE_FISCALITE_V2_JSON", JSON.stringify({ mode: "exonere", mention: "Scénario de test sans taxe" }));
    const paramsRpc: Record<string, string[]> = {
      abonnement_evenement_a_traiter: ["p_event_id", "p_type", "p_charge"], abonnement_evenement_solde: ["p_event_id", "p_erreur"], abonnement_evenement_rejouable: ["p_event_id"],
      lire_proposition_abonnement_service_v2: ["p_proposition"], reserver_traitement_abonnement_v2: ["p_org", "p_token"], liberer_traitement_abonnement_v2: ["p_org", "p_token"],
      appliquer_abonnement_v2: ["p_org", "p_snapshot", "p_event_id"], finir_proposition_abonnement_v2: ["p_proposition", "p_etat"],
    };
    transport.rpc.mockImplementation(async (nom: string, params: Record<string, unknown>) => {
      const noms = paramsRpc[nom]; if (!noms) throw new Error("RPC hors de la recette de paiement.");
      await db.query("savepoint transport_recette; set local role service_role");
      try { const r = await db.query(`select public.${nom}(${noms.map((_, i) => `$${i + 1}`).join(",")}) resultat`, noms.map(n => params[n]));
        await db.query("reset role; release savepoint transport_recette"); return { data: r.rows[0].resultat, error: null };
      } catch (e) { await db.query("rollback to savepoint transport_recette; reset role; release savepoint transport_recette"); return { data: null, error: { message: (e as Error).message } }; }
    });
    const p = await creerProposition(1, "souscription"); propositionId = p.id; snapshot = p.snapshot;
  }, 120000);
  afterAll(async () => {
    const erreurs: string[] = []; const nettoyer = async (label: string, action: () => Promise<unknown>) => { try { await action(); } catch { erreurs.push(label); } };
    if (stripe && abonnement) await nettoyer("abonnement test", async () => { if ((await stripe.subscriptions.retrieve(abonnement)).status !== "canceled") await stripe.subscriptions.cancel(abonnement); });
    if (stripe && customer) await nettoyer("client test", () => stripe.customers.del(customer));
    if (stripe) for (const id of prixCrees) await nettoyer("prix test", () => stripe.prices.update(id, { active: false }));
    if (stripe && product) await nettoyer("produit test", () => stripe.products.update(product, { active: false }));
    if (db) { await nettoyer("transaction locale", () => db.query("rollback")); await nettoyer("connexion locale", () => db.end()); }
    vi.unstubAllEnvs(); if (erreurs.length) throw new Error(`Nettoyage de recette incomplet : ${erreurs.join(", ")}`);
  }, 120000);
  it("le paiement accepté ouvre exactement la capacité et le montant consentis, même si l’événement est livré deux fois", async () => {
    const pm = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } }); await stripe.paymentMethods.attach(pm.id, { customer });
    const s = await stripe.subscriptions.create({ customer, default_payment_method: pm.id, payment_behavior: "error_if_incomplete", items: snapshot.stripe_lignes,
      metadata: { organization_id: org, tarification_version: VERSION_TARIFICATION, proposition_id: propositionId, volume_facture: "1" } });
    abonnement = s.id; expect(s.status).toBe("active"); expect(s.livemode).toBe(false);
    const evt = `evt_recette_v2_${randomUUID()}`; await livrer(s, "customer.subscription.created", evt);
    expect((await db.query("select capacite,montant_centimes,total_centimes,stripe_statut from public.abonnements_v2 where organization_id=$1", [org])).rows[0]).toMatchObject({ capacite: 1, montant_centimes: "599", total_centimes: "599", stripe_statut: "active" });
    expect(await livrer(s, "customer.subscription.created", evt)).toMatchObject({ deja_traite: evt });
    expect((await db.query("select count(*)::int n from public.evenements_abonnement_v2 where event_id=$1", [evt])).rows[0].n).toBe(1);
  }, 60000);
  it("l’accord d’augmentation sans règlement ne donne aucune capacité supplémentaire ; le règlement régularisé la donne une seule fois", async () => {
    const p = await creerProposition(3, "augmentation");
    const refuse = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_chargeCustomerFail" } }); await stripe.paymentMethods.attach(refuse.id, { customer });
    await stripe.subscriptions.update(abonnement, { default_payment_method: refuse.id });
    const enAttente = await augmenterAbonnementV2(stripe, await stripe.subscriptions.retrieve(abonnement), p.snapshot, org, p.id);
    expect(enAttente.pending_update).not.toBeNull(); await livrer(enAttente);
    expect((await db.query("select capacite,montant_centimes from public.abonnements_v2 where organization_id=$1", [org])).rows[0]).toMatchObject({ capacite: 1, montant_centimes: "599" });
    const bonne = await stripe.paymentMethods.create({ type: "card", card: { token: "tok_visa" } }); await stripe.paymentMethods.attach(bonne.id, { customer });
    const invoiceId = typeof enAttente.latest_invoice === "string" ? enAttente.latest_invoice : enAttente.latest_invoice!.id;
    await stripe.invoices.pay(invoiceId, { payment_method: bonne.id });
    const regle = await stripe.subscriptions.retrieve(abonnement); expect(regle.pending_update).toBeNull();
    await livrer(regle, "customer.subscription.pending_update_applied");
    expect((await db.query("select capacite,montant_centimes,total_centimes from public.abonnements_v2 where organization_id=$1", [org])).rows[0]).toMatchObject({ capacite: 3, montant_centimes: "999", total_centimes: "999" });
    // Un snapshot ancien livré plus tard relit Stripe : aucune régression à Solo.
    await livrer(enAttente); expect((await db.query("select capacite from public.abonnements_v2 where organization_id=$1", [org])).rows[0].capacite).toBe(3);
  }, 90000);
  it("résilier conserve la fin de période payée en base et un vieux message actif ne réouvre pas une souscription annulée", async () => {
    const courant = await stripe.subscriptions.retrieve(abonnement); const fin = courant.items.data[0].current_period_end;
    const arret = await stripe.subscriptions.update(abonnement, { cancel_at_period_end: true }); await livrer(arret);
    const a = (await db.query("select annulation_demandee,periode_fin,capacite from public.abonnements_v2 where organization_id=$1", [org])).rows[0];
    expect(a.annulation_demandee).toBe(true); expect(a.periode_fin.getTime()).toBe(fin * 1000); expect(a.capacite).toBe(3);
    await stripe.subscriptions.cancel(abonnement); await livrer(courant);
    expect((await db.query("select stripe_statut from public.abonnements_v2 where organization_id=$1", [org])).rows[0].stripe_statut).toBe("canceled");
  }, 60000);
});
