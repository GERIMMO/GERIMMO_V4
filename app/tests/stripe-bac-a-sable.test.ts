// Stripe réel en mode TEST + règles Gerimmo dans PostgreSQL local.
// Le transport du webhook est simulé et signé ; il n'est pas présenté comme
// une livraison de Stripe vers un site public ni comme une recette visuelle.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { creerSessionPaiement, assurerClientStripe, synchroniserQuantite, ouvrirPortailFacturation, MARQUE_PORTAIL } from "@/lib/stripe";
import {
  apercuChangement,
  appliquerBaisseAEcheance,
  appliquerHausse,
  creerSessionOffre,
  lignesStripe,
  metadonneesOffre,
  programmerPeriodicite,
  resilierAEcheance,
} from "@/lib/stripe-offres";
import { offreAbonnementUnique, offreAgence, offreFormule, offreParticulier, FORMULES_PARTICULIER } from "@/lib/tarifs";

const transport = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ rpc: transport.rpc }) }));
vi.mock("@/lib/relances-paiement", () => ({ envoyerRelancesDues: async () => ({ envois: 0 }) }));
import { POST } from "@/app/api/stripe/webhook/route";

const cle = process.env.GERIMMO_STRIPE_TEST_KEY;
/** Les RPC qui rendent une table (lues ligne à ligne). */
const FONCTIONS_TABLE = new Set(["abonnement_par_client", "abonnement_contexte_evenement", "abonnement_courrier_contexte"]);
/** Plan du 23/10 (migration 20261024110000) : les fonctions des courriers du contrat que le webhook appelle aussi. */
const RPC_COURRIERS: Record<string, string[]> = {
  abonnement_contexte_evenement: ["p_customer"],
  abonnement_souscription_datee: ["p_customer", "p_subscription", "p_souscrit_le"],
  abonnement_courrier_contexte: ["p_org"],
  abonnement_confirmation_envoyee: ["p_org", "p_subscription", "p_message", "p_piece_jointe"],
  abonnement_resiliation_accusee: ["p_org", "p_subscription", "p_periode_fin", "p_message", "p_chemin"],
  abonnement_resiliation_impaye_notifiee: ["p_org", "p_subscription", "p_message", "p_factures_annulees"],
};
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
    suivi.org = (await suivi.db.query("insert into public.organizations(name,type,status,essai_fin) values ('Recette Stripe fictive','proprietaire_direct','essai',current_date-1) returning id")).rows[0].id;
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
      stripe_evenement_prendre: ["p_event_id", "p_type", "p_reference", "p_jeton"],
      stripe_evenement_finir: ["p_event_id", "p_jeton", "p_reussi", "p_motif"],
      stripe_evenement_appliquer: ["p_event_id", "p_jeton", "p_action", "p_params"],
      abonnement_appliquer: ["p_customer", "p_subscription", "p_statut", "p_quantite", "p_periode_fin", "p_annulation"],
      abonnement_details: ["p_customer", "p_periodicite", "p_formule", "p_unites", "p_montant_periode_cents", "p_periode_debut"],
      abonnement_par_client: ["p_customer"],
      abonnement_facture_payee: ["p_customer", "p_subscription"],
      ...RPC_COURRIERS,
    };
    transport.rpc.mockImplementation(async (nom: string, params: Record<string, unknown>) => {
      const noms = argumentsRpc[nom]; if (!noms) throw new Error("Appel hors du périmètre de recette.");
      await suivi.db!.query("savepoint appel_recette; set local role service_role");
      try {
        const appel = `public.${nom}(${noms.map((_, i) => `$${i + 1}`).join(",")})`;
        // Une fonction qui rend une TABLE se lit ligne à ligne, comme PostgREST.
        const enTable = FONCTIONS_TABLE.has(nom);
        const r = await suivi.db!.query(enTable ? `select * from ${appel}` : `select ${appel} as resultat`, noms.map(n => params[n]));
        await suivi.db!.query("reset role; release savepoint appel_recette");
        return { data: enTable ? r.rows : r.rows[0].resultat, error: null };
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
      if (suivi.session) await nettoyer("page de paiement", async () => {
        const cs = await suivi.stripe!.checkout.sessions.retrieve(suivi.session!);
        if (cs.status === "open") await suivi.stripe!.checkout.sessions.expire(cs.id);
      });
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
    // Comme les références Stripe, les événements fictifs n'ont pas de tiret.
    // La garde SQL conserve ainsi son refus des références mal formées.
    const id = `evt_recette_${randomUUID().replaceAll("-", "")}`;
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
    const corps = JSON.stringify({ id: `evt_recette_${randomUUID().replaceAll("-", "")}`, object: "event", type: "customer.subscription.deleted", livemode: false, data: { object: s } });
    const r = await POST(new Request("http://localhost:3100/api/stripe/webhook", { method: "POST", body: corps,
      headers: { "stripe-signature": suivi.stripe!.webhooks.generateTestHeaderString({ payload: corps, secret }) } }));
    expect(r.status).toBe(200);
    expect((await suivi.db!.query("select status from organizations where id=$1", [suivi.org])).rows[0].status).toBe("suspendue");
  }, 60000);
});

// ── GRILLE DU 28/09/2026, contre le vrai Stripe de TEST ─────────────────────
// Montants de la grille envoyés tels quels (price_data), essai préservé,
// hausse avec prorata prélevé, carte refusée, baisse sans prorata, changement
// de périodicité à l'échéance, résiliation, miroir du webhook en base locale.
const nouvelle: { stripe?: Stripe; db?: Client; org?: string; client?: string; abonnements: string[]; sessions: string[]; echeanciers: string[] } = {
  abonnements: [],
  sessions: [],
  echeanciers: [],
};
const FRANCHISE = { nature: "franchise" } as const;
const TVA20 = { nature: "assujetti", tauxPourcent: 20 } as const;

describe.skipIf(!cle)("Grille en vigueur du 29/10/2026 chez Stripe (mode test)", () => {
  beforeAll(async () => {
    if (!cle?.startsWith("sk_test_") && !cle?.startsWith("rk_test_")) throw new Error("Une clé Stripe de TEST est obligatoire.");
    const url = new URL(process.env.SUPABASE_DB_URL ?? "");
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.startsWith("/gerimmo_ci_") || url.search) {
      throw new Error("La recette Stripe exige la base locale jetable.");
    }
    nouvelle.stripe = new Stripe(cle, { maxNetworkRetries: 1, timeout: 20000 });
    nouvelle.db = new Client({ connectionString: url.toString() });
    await nouvelle.db.connect();
    await nouvelle.db.query("begin");
    nouvelle.org = (await nouvelle.db.query(
      "insert into public.organizations(name,type,status,essai_fin) values ('Recette grille 2026','proprietaire_direct','essai',current_date+10) returning id"
    )).rows[0].id;
    const c = await assurerClientStripe(nouvelle.stripe, { orgId: nouvelle.org!, nom: "Gerimmo — recette grille 2026", email: null, existant: null });
    if (!c.ok) throw new Error("Client Stripe de test refusé.");
    nouvelle.client = c.customer;
    await nouvelle.db.query("insert into public.abonnements(organization_id,stripe_customer_id) values($1,$2)", [nouvelle.org, nouvelle.client]);
    const pm = await nouvelle.stripe.paymentMethods.attach("pm_card_visa", { customer: nouvelle.client! });
    await nouvelle.stripe.customers.update(nouvelle.client!, { invoice_settings: { default_payment_method: pm.id } });
    vi.stubEnv("STRIPE_SECRET_KEY", cle);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    transport.rpc.mockImplementation(async (nom: string, params: Record<string, unknown>) => {
      const noms: Record<string, string[]> = {
        stripe_evenement_prendre: ["p_event_id", "p_type", "p_reference", "p_jeton"],
        stripe_evenement_finir: ["p_event_id", "p_jeton", "p_reussi", "p_motif"],
        stripe_evenement_appliquer: ["p_event_id", "p_jeton", "p_action", "p_params"],
        abonnement_appliquer: ["p_customer", "p_subscription", "p_statut", "p_quantite", "p_periode_fin", "p_annulation"],
        abonnement_details: ["p_customer", "p_periodicite", "p_formule", "p_unites", "p_montant_periode_cents", "p_periode_debut"],
        abonnement_par_client: ["p_customer"],
        abonnement_facture_payee: ["p_customer", "p_subscription"],
        ...RPC_COURRIERS,
      };
      const liste = noms[nom];
      if (!liste) throw new Error("Appel hors du périmètre de recette.");
      await nouvelle.db!.query("savepoint appel; set local role service_role");
      try {
        const appel = `public.${nom}(${liste.map((_, i) => `$${i + 1}`).join(",")})`;
        const enTable = FONCTIONS_TABLE.has(nom);
        const r = await nouvelle.db!.query(enTable ? `select * from ${appel}` : `select ${appel} as resultat`, liste.map((n) => params[n]));
        await nouvelle.db!.query("reset role; release savepoint appel");
        return { data: enTable ? r.rows : r.rows[0].resultat, error: null };
      } catch (e) {
        await nouvelle.db!.query("rollback to savepoint appel; reset role; release savepoint appel");
        return { data: null, error: { message: (e as Error).message } };
      }
    });
  }, 120000);

  afterAll(async () => {
    const echecs: string[] = [];
    const nettoyer = async (nom: string, action: () => Promise<unknown>) => { try { await action(); } catch { echecs.push(nom); } };
    if (nouvelle.stripe) {
      for (const s of nouvelle.sessions) await nettoyer("session", async () => {
        const cs = await nouvelle.stripe!.checkout.sessions.retrieve(s);
        if (cs.status === "open") await nouvelle.stripe!.checkout.sessions.expire(s);
      });
      for (const e of nouvelle.echeanciers) await nettoyer("échéancier", async () => {
        const sc = await nouvelle.stripe!.subscriptionSchedules.retrieve(e);
        if (sc.status === "active" || sc.status === "not_started") await nouvelle.stripe!.subscriptionSchedules.release(e);
      });
      for (const a of nouvelle.abonnements) await nettoyer("abonnement", async () => {
        const s = await nouvelle.stripe!.subscriptions.retrieve(a);
        if (s.status !== "canceled") await nouvelle.stripe!.subscriptions.cancel(a);
      });
      if (nouvelle.client) await nettoyer("client", () => nouvelle.stripe!.customers.del(nouvelle.client!));
    }
    if (nouvelle.db) {
      await nettoyer("transaction", () => nouvelle.db!.query("rollback"));
      await nettoyer("connexion", () => nouvelle.db!.end());
    }
    vi.unstubAllEnvs();
    if (echecs.length) throw new Error(`Nettoyage à reprendre : ${echecs.join(", ")}.`);
  }, 180000);

  async function webhook(s: Stripe.Subscription, type = "customer.subscription.updated") {
    const corps = JSON.stringify({ id: `evt_grille_${randomUUID().replaceAll("-", "")}`, object: "event", type, livemode: false, data: { object: s } });
    const r = await POST(new Request("http://localhost:3100/api/stripe/webhook", { method: "POST", body: corps,
      headers: { "stripe-signature": nouvelle.stripe!.webhooks.generateTestHeaderString({ payload: corps, secret }) } }));
    expect(r.status).toBe(200);
    return r;
  }

  /** Défaut A01 (23/10) : une page ne s'ouvre que sous une intention réservée ; ici, une par page (expiration 45 min). */
  function intentionDeTest() {
    const maintenant = Date.now();
    return { id: randomUUID(), creeLeMs: maintenant, expireLeS: Math.floor(maintenant / 1000) + 45 * 60 };
  }

  async function miroir() {
    return (await nouvelle.db!.query(
      "select o.status, a.periodicite, a.formule, a.unites_souscrites, a.montant_periode_cents::int as montant, a.annulation_demandee from public.abonnements a join public.organizations o on o.id=a.organization_id where a.organization_id=$1",
      [nouvelle.org]
    )).rows[0];
  }

  it("la page de paiement annuelle porte 1 180 € + 5 × 59 € et préserve l'essai", async () => {
    const r = await creerSessionOffre(nouvelle.stripe!, {
      offre: offreParticulier(25, "annuel"), regime: FRANCHISE, customer: nouvelle.client!, orgId: nouvelle.org!,
      retourOk: "http://localhost:3100/ok", retourAnnule: "http://localhost:3100/annule",
      essaiFin: new Date(Date.now() + 10 * 86400_000).toISOString().slice(0, 10),
      intention: intentionDeTest(),
    });
    expect(r.ok, r.ok ? "" : r.erreur).toBe(true);
    const s = (await nouvelle.stripe!.checkout.sessions.list({ customer: nouvelle.client, limit: 1 })).data[0];
    nouvelle.sessions.push(s.id);
    expect(s.livemode).toBe(false);
    // L'essai est préservé : rien n'est dû aujourd'hui, le premier
    // prélèvement (1 475 €) partira à la fin de l'essai.
    expect(s.amount_total).toBe(0);
    const lignes = (await nouvelle.stripe!.checkout.sessions.listLineItems(s.id)).data;
    expect(lignes.map((l) => [l.price?.unit_amount, l.quantity, l.price?.recurring?.interval])).toEqual([
      [118000, 1, "year"],
      [5900, 5, "year"],
    ]);
    // Sans essai à préserver : le montant annuel est dû à la validation.
    const r2 = await creerSessionOffre(nouvelle.stripe!, {
      offre: offreParticulier(25, "annuel"), regime: FRANCHISE, customer: nouvelle.client!, orgId: nouvelle.org!,
      retourOk: "http://localhost:3100/ok", retourAnnule: "http://localhost:3100/annule",
      intention: intentionDeTest(),
    });
    expect(r2.ok).toBe(true);
    const s2 = (await nouvelle.stripe!.checkout.sessions.list({ customer: nouvelle.client, limit: 1 })).data[0];
    nouvelle.sessions.push(s2.id);
    expect(s2.amount_total).toBe(147500);
  }, 60000);

  it("souscription Bailleur mensuelle, puis hausse vers Investisseur : prorata aperçu = prorata prélevé ; miroir à jour", async () => {
    const bailleur = offreFormule(FORMULES_PARTICULIER[1], 3, "mensuel")!;
    const lignes = await lignesStripe(nouvelle.stripe!, bailleur, FRANCHISE);
    const s = await nouvelle.stripe!.subscriptions.create({
      customer: nouvelle.client!,
      items: lignes.map((l) => ({ price_data: l.prix, quantity: l.quantite })),
      metadata: metadonneesOffre(nouvelle.org!, bailleur),
      payment_behavior: "error_if_incomplete",
    });
    nouvelle.abonnements.push(s.id);
    expect(s.status).toBe("active");
    await webhook(s, "customer.subscription.created");
    expect(await miroir()).toMatchObject({ status: "active", periodicite: "mensuel", formule: "bailleur", unites_souscrites: 3, montant: 1770 });

    const investisseur = offreFormule(FORMULES_PARTICULIER[2], 4, "mensuel")!;
    const apercu = await apercuChangement(nouvelle.stripe!, { subscription: s.id, offre: investisseur, regime: FRANCHISE });
    if (!apercu.ok) throw new Error(apercu.erreur);
    expect(apercu.immediatCents).toBeGreaterThan(0);
    expect(apercu.immediatCents).toBeLessThanOrEqual(4130);
    const h = await appliquerHausse(nouvelle.stripe!, { subscription: s.id, offre: investisseur, regime: FRANCHISE, orgId: nouvelle.org!, prorationDate: apercu.prorationDate });
    if (!h.ok) throw new Error(h.erreur);
    const facture = await nouvelle.stripe!.invoices.retrieve(h.souscription.latest_invoice as string);
    expect(facture.amount_paid).toBe(apercu.immediatCents);
    await webhook(h.souscription);
    expect(await miroir()).toMatchObject({ formule: "investisseur", unites_souscrites: 10, montant: 5900 });
  }, 120000);

  it("une carte refusée au prorata : la hausse n'est pas appliquée, la formule reste", async () => {
    const s = await nouvelle.stripe!.subscriptions.retrieve(nouvelle.abonnements[0]);
    const refus = await nouvelle.stripe!.paymentMethods.attach("pm_card_chargeCustomerFail", { customer: nouvelle.client! });
    await nouvelle.stripe!.customers.update(nouvelle.client!, { invoice_settings: { default_payment_method: refus.id } });
    await nouvelle.stripe!.subscriptions.update(s.id, { default_payment_method: refus.id });
    const patrimoine = offreFormule(FORMULES_PARTICULIER[3], 11, "mensuel")!;
    const apercu = await apercuChangement(nouvelle.stripe!, { subscription: s.id, offre: patrimoine, regime: FRANCHISE });
    if (!apercu.ok) throw new Error(apercu.erreur);
    const h = await appliquerHausse(nouvelle.stripe!, { subscription: s.id, offre: patrimoine, regime: FRANCHISE, orgId: nouvelle.org!, prorationDate: apercu.prorationDate });
    expect(h.ok).toBe(false);
    const apres = await nouvelle.stripe!.subscriptions.retrieve(s.id);
    expect(apres.metadata.gerimmo_formule).toBe("investisseur");
    const visa = await nouvelle.stripe!.paymentMethods.attach("pm_card_visa", { customer: nouvelle.client! });
    await nouvelle.stripe!.subscriptions.update(s.id, { default_payment_method: visa.id });
  }, 120000);

  it("baisse à l'échéance : par échéancier, aucun prorata, la période en cours et la capacité payée restent entières", async () => {
    const s0 = await nouvelle.stripe!.subscriptions.retrieve(nouvelle.abonnements[0]);
    const avant = (await nouvelle.stripe!.invoices.list({ subscription: s0.id })).data.length;
    const r = await appliquerBaisseAEcheance(nouvelle.stripe!, { subscription: s0.id, offre: offreParticulier(2, "mensuel"), regime: FRANCHISE, orgId: nouvelle.org! });
    if (!r.ok) throw new Error(r.erreur);
    nouvelle.echeanciers.push(r.echeancier);
    expect((await nouvelle.stripe!.invoices.list({ subscription: s0.id })).data.length).toBe(avant);
    const sc = await nouvelle.stripe!.subscriptionSchedules.retrieve(r.echeancier);
    expect(sc.phases).toHaveLength(2);
    expect(sc.phases[1].start_date).toBe(sc.phases[0].end_date);
    expect(sc.phases[1].metadata).toMatchObject({ gerimmo_formule: "bailleur", gerimmo_unites: "3" });
    // D'ici l'échéance, rien ne change : la souscription facture Investisseur.
    const s1 = await nouvelle.stripe!.subscriptions.retrieve(s0.id);
    expect(s1.metadata.gerimmo_formule).toBe("investisseur");
    await webhook(s1);
    expect(await miroir()).toMatchObject({ formule: "investisseur", unites_souscrites: 10, montant: 5900 });
  }, 120000);

  it("passage à l'annuel programmé à l'échéance, jamais en cours de période", async () => {
    const s0 = await nouvelle.stripe!.subscriptions.retrieve(nouvelle.abonnements[0]);
    const r = await programmerPeriodicite(nouvelle.stripe!, { subscription: s0.id, offre: offreParticulier(2, "annuel"), regime: FRANCHISE, orgId: nouvelle.org! });
    if (!r.ok) throw new Error(r.erreur);
    if (!nouvelle.echeanciers.includes(r.echeancier)) nouvelle.echeanciers.push(r.echeancier);
    const sc = await nouvelle.stripe!.subscriptionSchedules.retrieve(r.echeancier);
    expect(sc.phases).toHaveLength(2);
    expect(sc.phases[0].start_date).toBe(sc.current_phase?.start_date);
    expect(sc.phases[1].start_date).toBe(sc.phases[0].end_date);
    const s1 = await nouvelle.stripe!.subscriptions.retrieve(s0.id);
    expect(s1.items.data[0].price.recurring?.interval).toBe("month"); // la période en cours ne change pas
  }, 120000);

  it("résiliation pour l'échéance : l'accès reste ouvert jusqu'au bout de la période payée", async () => {
    const r = await resilierAEcheance(nouvelle.stripe!, { subscription: nouvelle.abonnements[0], resilier: true });
    if (!r.ok) throw new Error(r.erreur);
    expect(r.echeancierLibere).toBe(true);
    expect(r.souscription.schedule).toBeNull();
    expect(r.souscription.cancel_at_period_end).toBe(true);
    await webhook(r.souscription);
    expect(await miroir()).toMatchObject({ status: "active", annulation_demandee: true });
    const fin = await nouvelle.stripe!.subscriptions.cancel(nouvelle.abonnements[0]);
    await webhook(fin, "customer.subscription.deleted");
    // Essai encore en cours dans la base de recette : l'organisation y retombe ;
    // essai fini, elle passerait en lecture seule — données conservées.
    expect((await miroir()).status).toBe("essai");
  }, 120000);

  it("agence assujettie : lignes HT par tranche et TVA 20 % en sus, total TTC exact", async () => {
    const offre = offreAgence(100);
    const lignes = await lignesStripe(nouvelle.stripe!, offre, TVA20);
    const apercu = await nouvelle.stripe!.invoices.createPreview({
      customer: nouvelle.client!,
      subscription_details: { items: lignes.map((l) => ({ price_data: l.prix, quantity: l.quantite, tax_rates: l.tax_rates })) },
    });
    expect(apercu.subtotal).toBe(49000);
    expect(apercu.total).toBe(58800);
  }, 60000);

  it("renouvelle une échéance réelle de TEST et reçoit son webhook signé via le relais local", async () => {
    const stripe = nouvelle.stripe!;
    const clock = await stripe.testHelpers.testClocks.create({ frozen_time: Math.floor(Date.now()/1000), name: "Gerimmo — renouvellement fictif" });
    let client = "", signature = "", sortie = "";
    const recus: { type: string; statut: number }[] = [];
    const differes = new Map<string,{corps:string;entete:string}>();
    let chaine = Promise.resolve();
    const serveur = createServer((req,res) => {
      const morceaux: Buffer[]=[];
      req.on("data", b=>morceaux.push(Buffer.from(b)));
      req.on("end",()=>{
        chaine=chaine.then(async()=>{
          try {
            const corps=Buffer.concat(morceaux).toString("utf8");
            const entete=String(req.headers["stripe-signature"]??"");
            const evenement=stripe.webhooks.constructEvent(corps,entete,signature);
            if(evenement.livemode) { res.writeHead(403).end(); return; }
            const objet=evenement.data.object as unknown as {customer?:string};
            if(!client||objet.customer!==client) { res.writeHead(200).end(); return; }
            const reponse=await POST(new Request("http://127.0.0.1/api/stripe/webhook",{method:"POST",body:corps,headers:{"stripe-signature":entete}}));
            if ([500,503].includes(reponse.status)) differes.set(evenement.id,{corps,entete});
            else differes.delete(evenement.id);
            recus.push({type:evenement.type,statut:reponse.status});
            res.writeHead(reponse.status).end();
          } catch { res.writeHead(400).end(); }
        });
      });
    });
    await new Promise<void>(r=>serveur.listen(0,"127.0.0.1",r));
    const adresse=serveur.address(); if(!adresse||typeof adresse==="string")throw new Error("Récepteur local indisponible");
    const relais=spawn(process.env.GERIMMO_STRIPE_CLI??"stripe",["listen","--events","customer.subscription.created,customer.subscription.updated,invoice.paid","--forward-to",`http://127.0.0.1:${adresse.port}`],{env:{...process.env,STRIPE_API_KEY:cle,STRIPE_DEVICE_NAME:"gerimmo-ci-isole"},stdio:["ignore","pipe","pipe"]});
    let erreurRelais=false;
    relais.on("error",()=>{erreurRelais=true;});
    const lire=(b:Buffer)=>{sortie=(sortie+b.toString()).slice(-12000);signature=sortie.match(/whsec_[A-Za-z0-9]+/)?.[0]??signature;};
    relais.stdout.on("data",lire);relais.stderr.on("data",lire);
    const attendre=async(condition:()=>Promise<boolean>,message:string)=>{
      const fin=Date.now()+120000;
      while(Date.now()<fin){if(erreurRelais)throw new Error("Relais Stripe TEST indisponible");if(await condition())return;await new Promise(r=>setTimeout(r,1000));}
      throw new Error(message);
    };
    try {
      await attendre(async()=>Boolean(signature),"Le relais Stripe TEST n’est pas prêt");
      vi.stubEnv("STRIPE_WEBHOOK_SECRET",signature);
      const org=(await nouvelle.db!.query("insert into public.organizations(name,type,status,essai_fin) values('Horloge Stripe fictive','proprietaire_direct','essai',current_date-1) returning id")).rows[0].id;
      const c=await stripe.customers.create({name:"Gerimmo — horloge fictive",test_clock:clock.id,metadata:{gerimmo_org:org}});client=c.id;expect(c.livemode).toBe(false);
      await chaine;
      await nouvelle.db!.query("insert into public.abonnements(organization_id,stripe_customer_id) values($1,$2)",[org,client]);
      const pm=await stripe.paymentMethods.attach("pm_card_visa",{customer:client});
      await stripe.customers.update(client,{invoice_settings:{default_payment_method:pm.id}});
      const offre=offreAbonnementUnique(1,"mensuel");const lignes=await lignesStripe(stripe,offre,FRANCHISE);
      const souscription=await stripe.subscriptions.create({customer:client,items:lignes.map(l=>({price_data:l.prix,quantity:l.quantite})),metadata:metadonneesOffre(org,offre)});
      const echeance=souscription.items.data[0].current_period_end;
      await stripe.testHelpers.testClocks.advance(clock.id,{frozen_time:echeance+7200});
      await attendre(async()=>(await stripe.testHelpers.testClocks.retrieve(clock.id)).status==="ready","Horloge Stripe non finalisée");
      await attendre(async()=>{
        const factures=await stripe.invoices.list({customer:client,subscription:souscription.id});
        return factures.data.some(f=>f.billing_reason==="subscription_cycle"&&f.status==="paid"&&f.amount_paid===599);
      },"Renouvellement de TEST non payé");
      await attendre(async()=>recus.some(e=>e.type==="invoice.paid"&&e.statut===200)&&recus.some(e=>e.type==="customer.subscription.updated"&&e.statut===200),"Webhooks de renouvellement non reçus par Gerimmo local");
      await chaine;
      // Une facture peut précéder le webhook de création. Le refus temporaire doit
      // rester en file et le même événement signé doit ensuite aboutir, sans doublon.
      expect(recus.every(e=>[200,500,503].includes(e.statut))).toBe(true);
      for (const [id, message] of differes) {
        expect((await nouvelle.db!.query("select traite_le from public.abonnement_evenements where stripe_event_id=$1",[id])).rows).toHaveLength(1);
        await attendre(async()=>{
          const res=await POST(new Request("http://127.0.0.1/api/stripe/webhook",{method:"POST",body:message.corps,headers:{"stripe-signature":message.entete}}));
          return res.status===200;
        },"La réception Stripe différée n’a pas abouti");
        expect((await nouvelle.db!.query("select traite_le from public.abonnement_evenements where stripe_event_id=$1",[id])).rows[0].traite_le).toBeTruthy();
      }
      expect((await nouvelle.db!.query("select count(*)::int n from public.audit_log where organization_id=$1 and action='abonnement_premiere_facture_payee'",[org])).rows[0].n).toBe(1);
      const miroir=(await nouvelle.db!.query("select a.montant_periode_cents::int montant,o.status from public.abonnements a join public.organizations o on o.id=a.organization_id where a.organization_id=$1",[org])).rows[0];
      expect(miroir).toMatchObject({montant:599,status:"active"});
    } finally {
      relais.kill("SIGTERM");await chaine;
      await new Promise<void>(r=>serveur.close(()=>r()));
      await stripe.testHelpers.testClocks.del(clock.id);
      vi.stubEnv("STRIPE_WEBHOOK_SECRET",secret);
      sortie="";signature="";
    }
  }, 420000);

  it("abonnement unique : seuils et changements de capacité, sans double prélèvement sur le plateau", async () => {
    const stripe = nouvelle.stripe!;
    const initiale = offreAbonnementUnique(1, "mensuel");
    const [ligne] = await lignesStripe(stripe, initiale, FRANCHISE);
    const carte=await stripe.paymentMethods.attach("pm_card_visa",{customer:nouvelle.client!});
    const s = await stripe.subscriptions.create({customer:nouvelle.client!,default_payment_method:carte.id,items:[{price_data:ligne.prix,quantity:1}],
      metadata:metadonneesOffre(nouvelle.org!,initiale),payment_behavior:"error_if_incomplete"});
    nouvelle.abonnements.push(s.id);
    expect(s.livemode).toBe(false);
    for (const [n, cents] of [[2,798],[7,1793],[8,1990],[10,1990],[20,1990],[21,2089],[30,2980]]) {
      const offre=offreAbonnementUnique(n,"mensuel");
      const a=await apercuChangement(stripe,{subscription:s.id,offre,regime:FRANCHISE});
      if (!a.ok) throw new Error(a.erreur);
      if(n===10||n===20) expect(a.immediatCents).toBe(0);
      const h=await appliquerHausse(stripe,{subscription:s.id,offre,regime:FRANCHISE,orgId:nouvelle.org!,prorationDate:a.prorationDate});
      if(!h.ok) throw new Error(h.erreur);
      expect(h.souscription.items.data.map(i=>[i.price.unit_amount,i.quantity])).toEqual([[cents,1]]);
      expect(h.souscription.metadata.gerimmo_unites).toBe(String(n));
    }
    const baisse=await appliquerBaisseAEcheance(stripe,{subscription:s.id,offre:offreAbonnementUnique(20,"mensuel"),regime:FRANCHISE,orgId:nouvelle.org!});
    if(!baisse.ok) throw new Error(baisse.erreur);
    nouvelle.echeanciers.push(baisse.echeancier);
    const phases=(await stripe.subscriptionSchedules.retrieve(baisse.echeancier)).phases;
    expect(phases[1].metadata).toMatchObject({gerimmo_unites:"20",gerimmo_montant_cents:"1990"});
    for(const [n,periode,prix] of [[20,"annuel","19900"],[0,"mensuel","0"]] as const){
      const choix=await programmerPeriodicite(stripe,{subscription:s.id,offre:offreAbonnementUnique(n,periode),regime:FRANCHISE,orgId:nouvelle.org!});
      if(!choix.ok) throw new Error(choix.erreur);
      const sc=await stripe.subscriptionSchedules.retrieve(choix.echeancier);
      expect(sc.phases[1].metadata).toMatchObject({gerimmo_unites:String(n),gerimmo_periodicite:periode,gerimmo_montant_cents:prix});
      expect(sc.end_behavior).toBe("release");
    }
    const offreAn=offreAbonnementUnique(3,"annuel");
    const [ligneAn]=await lignesStripe(stripe,offreAn,FRANCHISE);
    const annuel=await stripe.subscriptions.create({customer:nouvelle.client!,default_payment_method:carte.id,items:[{price_data:ligneAn.prix,quantity:1}],metadata:metadonneesOffre(nouvelle.org!,offreAn),payment_behavior:"error_if_incomplete"});
    nouvelle.abonnements.push(annuel.id);
    const mensuel=await programmerPeriodicite(stripe,{subscription:annuel.id,offre:offreAbonnementUnique(3,"mensuel"),regime:FRANCHISE,orgId:nouvelle.org!});
    if(!mensuel.ok)throw new Error(mensuel.erreur);
    nouvelle.echeanciers.push(mensuel.echeancier);
    expect((await stripe.subscriptionSchedules.retrieve(mensuel.echeancier)).phases[1].metadata).toMatchObject({gerimmo_unites:"3",gerimmo_periodicite:"mensuel",gerimmo_montant_cents:"997"});
  }, 240000);

  it("portail client : aucune résiliation (plan du 23/10, R04), aucun changement de formule, toujours la configuration Gerimmo", async () => {
    const r = await ouvrirPortailFacturation(nouvelle.stripe!, { customer: nouvelle.client!, retour: "https://www.gerimmo.app/agence/x/abonnement" });
    if (!r.ok) throw new Error(r.erreur);
    expect(r.url).toMatch(/^https:\/\/billing\.stripe\.com\//);
    const configs: Stripe.BillingPortal.Configuration[] = [];
    for await (const c of nouvelle.stripe!.billingPortal.configurations.list({ active: true, limit: 100 })) {
      if (c.metadata?.gerimmo === MARQUE_PORTAIL) configs.push(c);
    }
    expect(configs).toHaveLength(1); // créée une fois, retrouvée ensuite
    const f = configs[0].features;
    // Un seul chemin de résiliation : la page « Résilier votre contrat » de Gerimmo.
    expect(f.subscription_cancel.enabled).toBe(false);
    expect(f.subscription_update.enabled).toBe(false);
    expect(f.invoice_history.enabled).toBe(true);
    expect(f.payment_method_update.enabled).toBe(true);
    // Une deuxième ouverture réutilise la même configuration.
    const r2 = await ouvrirPortailFacturation(nouvelle.stripe!, { customer: nouvelle.client!, retour: "https://www.gerimmo.app/agence/x/abonnement" });
    expect(r2.ok).toBe(true);
    let n = 0;
    for await (const c of nouvelle.stripe!.billingPortal.configurations.list({ active: true, limit: 100 })) {
      if (c.metadata?.gerimmo === MARQUE_PORTAIL) n++;
    }
    expect(n).toBe(1);
  }, 60000);
});
