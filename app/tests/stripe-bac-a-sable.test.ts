// Stripe réel en mode TEST + règles Gerimmo dans PostgreSQL local.
// Le transport du webhook est simulé et signé ; il n'est pas présenté comme
// une livraison de Stripe vers un site public ni comme une recette visuelle.
import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { creerSessionPaiement, assurerClientStripe, synchroniserQuantite } from "@/lib/stripe";

const transport = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ rpc: transport.rpc }) }));
vi.mock("@/lib/relances-paiement", () => ({ envoyerRelancesDues: async () => ({ envois: 0 }) }));
import { POST } from "@/app/api/stripe/webhook/route";

const cle = process.env.GERIMMO_STRIPE_TEST_KEY;
const secret = `whsec_${randomBytes(24).toString("hex")}`;
const suivi: { stripe?: Stripe; db?: Client; client?: string; produit?: string; prix?: string; abonnement?: string; session?: string; org?: string } = {};

describe.skipIf(!cle)("Paiements simulés chez Stripe et application dans Gerimmo", () => {
  beforeAll(async () => {
    if (!cle?.startsWith("sk_test_") && !cle?.startsWith("rk_test_")) throw new Error("Une clé Stripe de TEST est obligatoire.");
    const url = new URL(process.env.SUPABASE_DB_URL ?? "");
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.startsWith("/gerimmo_ci_") || url.search) {
      throw new Error("La recette Stripe exige la base locale jetable.");
    }
    suivi.stripe = new Stripe(cle, { maxNetworkRetries: 1, timeout: 20000 });
    suivi.db = new Client({ connectionString: url.toString() }); await suivi.db.connect(); await suivi.db.query("begin");
    suivi.org = (await suivi.db.query("insert into public.organizations(tarification_version,name,type,status,essai_fin) values ('historique','Recette Stripe fictive','proprietaire_direct','essai',current_date-1) returning id")).rows[0].id;
    const client = await assurerClientStripe(suivi.stripe, { orgId: suivi.org!, nom: "Gerimmo — recette fictive", email: null, existant: null });
    if (!client.ok) throw new Error("Création du client Stripe de test refusée.");
    suivi.client = client.customer;
    await suivi.db.query("insert into public.abonnements(organization_id,stripe_customer_id) values($1,$2)", [suivi.org, suivi.client]);
    const produit = await suivi.stripe.products.create({ name: "Gerimmo — recette sans argent réel", metadata: { usage: "recette_automatique" } });
    expect(produit.livemode).toBe(false); suivi.produit = produit.id;
    const prix = await suivi.stripe.prices.create({ product: produit.id, currency: "eur", unit_amount: 100, recurring: { interval: "month" } });
    suivi.prix = prix.id;
    vi.stubEnv("STRIPE_SECRET_KEY", cle); vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    // Seul le transport Supabase est substitué : les fonctions SQL appelées
    // par la route sont réellement exécutées, avec le rôle service_role.
    const argumentsRpc: Record<string, string[]> = {
      abonnement_evenement_a_traiter: ["p_event_id", "p_type", "p_charge"],
      abonnement_evenement_solde: ["p_event_id", "p_erreur"],
      abonnement_evenement_rejouable: ["p_event_id"],
      abonnement_appliquer: ["p_customer", "p_subscription", "p_statut", "p_quantite", "p_periode_fin", "p_annulation"],
    };
    transport.rpc.mockImplementation(async (nom: string, params: Record<string, unknown>) => {
      const noms = argumentsRpc[nom]; if (!noms) throw new Error("Appel hors du périmètre de recette.");
      await suivi.db!.query("savepoint appel_recette; set local role service_role");
      try {
        const r = await suivi.db!.query(`select public.${nom}(${noms.map((_, i) => `$${i + 1}`).join(",")}) as resultat`, noms.map(n => params[n]));
        await suivi.db!.query("reset role; release savepoint appel_recette");
        return { data: r.rows[0].resultat, error: null };
      } catch {
        await suivi.db!.query("rollback to savepoint appel_recette; reset role; release savepoint appel_recette");
        return { data: null, error: { message: "Règle SQL refusée pendant la recette." } };
      }
    });
  }, 120000);

  afterAll(async () => {
    const echecs: string[] = [];
    const nettoyer = async (nom: string, action: () => Promise<unknown>) => { try { await action(); } catch { echecs.push(nom); } };
    if (suivi.stripe) {
      if (suivi.session) await nettoyer("page de paiement", () => suivi.stripe!.checkout.sessions.expire(suivi.session!));
      if (suivi.abonnement) await nettoyer("abonnement", async () => {
        const s = await suivi.stripe!.subscriptions.retrieve(suivi.abonnement!);
        if (s.status !== "canceled") await suivi.stripe!.subscriptions.cancel(s.id);
      });
      if (suivi.prix) await nettoyer("tarif", () => suivi.stripe!.prices.update(suivi.prix!, { active: false }));
      if (suivi.produit) await nettoyer("produit", () => suivi.stripe!.products.update(suivi.produit!, { active: false }));
      if (suivi.client) await nettoyer("client fictif", () => suivi.stripe!.customers.del(suivi.client!));
    }
    if (suivi.db) {
      await nettoyer("transaction locale", () => suivi.db!.query("rollback"));
      await nettoyer("connexion locale", () => suivi.db!.end());
    }
    vi.unstubAllEnvs();
    if (echecs.length) throw new Error(`Nettoyage des objets de test à reprendre : ${echecs.join(", ")}.`);
  }, 120000);

  it("prépare la page de paiement avec les retours Gerimmo et le bon nombre de biens", async () => {
    const r = await creerSessionPaiement(suivi.stripe!, { prix: suivi.prix!, customer: suivi.client!, quantite: 2,
      orgId: suivi.org!, retourOk: "http://localhost:3100/espaces?paiement=ok", retourAnnule: "http://localhost:3100/espaces?paiement=annule" });
    expect(r.ok).toBe(true);
    const sessions = await suivi.stripe!.checkout.sessions.list({ customer: suivi.client, limit: 1 });
    const s = sessions.data[0]; suivi.session = s.id;
    expect(s.livemode).toBe(false); expect(s.client_reference_id).toBe(suivi.org);
    expect(s.success_url).toBe("http://localhost:3100/espaces?paiement=ok");
    expect((await suivi.stripe!.checkout.sessions.listLineItems(s.id)).data[0].quantity).toBe(2);
  });

  it("un paiement accepté active l'abonnement, et le même événement n'est pas appliqué deux fois", async () => {
    const pm = await suivi.stripe!.paymentMethods.create({ type: "card", card: { token: "tok_visa" } });
    await suivi.stripe!.paymentMethods.attach(pm.id, { customer: suivi.client! });
    const s = await suivi.stripe!.subscriptions.create({ customer: suivi.client!, default_payment_method: pm.id,
      items: [{ price: suivi.prix!, quantity: 2 }], payment_behavior: "error_if_incomplete" });
    suivi.abonnement = s.id; expect(s.livemode).toBe(false); expect(s.status).toBe("active");
    const id = `evt_recette_${randomUUID()}`;
    const corps = JSON.stringify({ id, object: "event", type: "customer.subscription.created", livemode: false, data: { object: s } });
    const requete = () => new Request("http://localhost:3100/api/stripe/webhook", { method: "POST", body: corps,
      headers: { "stripe-signature": suivi.stripe!.webhooks.generateTestHeaderString({ payload: corps, secret }) } });
    const premier = await POST(requete()); expect(premier.status).toBe(200);
    expect(await premier.json()).toMatchObject({ organisation: suivi.org });
    expect((await suivi.db!.query("select status from organizations where id=$1", [suivi.org])).rows[0].status).toBe("active");
    expect(await (await POST(requete())).json()).toMatchObject({ deja_traite: id });
  }, 60000);

  it("une carte refusée reste un refus, sans débit réel", async () => {
    await expect(suivi.stripe!.paymentIntents.create({ amount: 100, currency: "eur", payment_method: "pm_card_chargeDeclined",
      confirm: true, automatic_payment_methods: { enabled: true, allow_redirects: "never" } })).rejects.toMatchObject({ code: "card_declined" });
  });

  it("une carte nécessitant une confirmation bancaire attend cette confirmation", async () => {
    const p = await suivi.stripe!.paymentIntents.create({ amount: 100, currency: "eur", payment_method: "pm_card_threeDSecure2Required",
      confirm: true, automatic_payment_methods: { enabled: true, allow_redirects: "never" } });
    expect(p.livemode).toBe(false); expect(p.status).toBe("requires_action");
    await suivi.stripe!.paymentIntents.cancel(p.id);
  });

  it("un remboursement simulé est enregistré chez Stripe", async () => {
    const p = await suivi.stripe!.paymentIntents.create({ amount: 100, currency: "eur", payment_method: "pm_card_visa",
      confirm: true, automatic_payment_methods: { enabled: true, allow_redirects: "never" } });
    expect(p.status).toBe("succeeded"); expect(p.livemode).toBe(false);
    const r = await suivi.stripe!.refunds.create({ payment_intent: p.id }); expect(r.status).toBe("succeeded");
  });

  it("ajuste la quantité puis résilie, et Gerimmo retrouve l'état final", async () => {
    expect(await synchroniserQuantite(suivi.stripe!, { subscription: suivi.abonnement!, quantite: 3 })).toMatchObject({ ok: true, quantite: 3 });
    expect(await synchroniserQuantite(suivi.stripe!, { subscription: suivi.abonnement!, quantite: 0 })).toMatchObject({ ok: true, resiliee: true });
    const s = await suivi.stripe!.subscriptions.cancel(suivi.abonnement!);
    const corps = JSON.stringify({ id: `evt_recette_${randomUUID()}`, object: "event", type: "customer.subscription.deleted", livemode: false, data: { object: s } });
    const r = await POST(new Request("http://localhost:3100/api/stripe/webhook", { method: "POST", body: corps,
      headers: { "stripe-signature": suivi.stripe!.webhooks.generateTestHeaderString({ payload: corps, secret }) } }));
    expect(r.status).toBe(200);
    expect((await suivi.db!.query("select status from organizations where id=$1", [suivi.org])).rows[0].status).toBe("suspendue");
  }, 60000);
});
