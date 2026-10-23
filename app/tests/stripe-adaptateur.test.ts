/**
 * L'adaptateur Stripe, sans toucher à Stripe.
 *
 * Ce qui est testé ici est ce qui décide TOUT SEUL : faut-il tenter un appel,
 * que dire quand il échoue, où lire la fin de période, quelle fin d'essai
 * poser. Le reste — ouvrir le portail — n'est qu'un passe-plat vers une API
 * tierce, et un test qui simule cette API ne vérifierait que la simulation.
 * La page de paiement, elle, décide quelque chose depuis le 24/09 (la fin
 * d'essai) : on regarde donc ce qu'elle envoie, sans regarder ce qui revient.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assurerClientStripe,
  assurerConfigurationPortail,
  MARQUE_PORTAIL,
  verifierAucuneSouscriptionVivante,
  verifierClientDeLOrganisation,
  configurationStripe,
  creerSessionPaiement,
  finDePeriode,
  finEssaiPourStripe,
  lireErreurStripe,
  prixPour,
  quantiteFacturee,
  variablePrix,
  crediterClientStripe,
} from "@/lib/stripe";

const VARIABLES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRIX_BIEN",
  "STRIPE_PRIX_LOT_AGENCE",
] as const;
const initial = Object.fromEntries(VARIABLES.map((v) => [v, process.env[v]]));

afterEach(() => {
  for (const v of VARIABLES) {
    if (initial[v] === undefined) delete process.env[v];
    else process.env[v] = initial[v];
  }
});

function poser(valeurs: Partial<Record<(typeof VARIABLES)[number], string | undefined>>) {
  for (const v of VARIABLES) {
    const x = valeurs[v];
    if (x === undefined) delete process.env[v];
    else process.env[v] = x;
  }
}

describe("Réglages : rien ne marche à moitié", () => {
  it("sans clé ni signature, l'adaptateur dit lesquelles manquent", () => {
    poser({});
    const r = configurationStripe();
    expect(r.pret).toBe(false);
    if (r.pret) return;
    // Le motif est écrit pour être LU par un humain qui doit les poser :
    // « la facturation n'est pas configurée » n'aide personne à la configurer.
    expect(r.motif).toContain("STRIPE_SECRET_KEY");
    expect(r.motif).toContain("STRIPE_WEBHOOK_SECRET");
  });

  it("une seule variable manquante suffit à refuser, et elle est nommée", () => {
    poser({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: undefined });
    const r = configurationStripe();
    expect(r.pret).toBe(false);
    if (r.pret) return;
    expect(r.motif).toContain("STRIPE_WEBHOOK_SECRET");
    expect(r.motif).toContain("est absente");
    expect(r.motif).not.toContain("STRIPE_SECRET_KEY");
  });

  it("une variable vide ou blanche vaut absente", () => {
    // Une variable posée à «   » dans un tableau de bord est une variable
    // qu'on a cru poser. La traiter comme présente ferait échouer l'appel
    // chez Stripe, avec un message d'API au lieu d'une consigne.
    poser({ STRIPE_SECRET_KEY: "   ", STRIPE_WEBHOOK_SECRET: "whsec_x" });
    expect(configurationStripe().pret).toBe(false);
  });

  it("clé et signature posées, la configuration est prête, espaces retirés", () => {
    poser({
      STRIPE_SECRET_KEY: " sk_test_x ",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
      STRIPE_PRIX_BIEN: "price_bien\n",
    });
    const r = configurationStripe();
    expect(r.pret).toBe(true);
    if (!r.pret) return;
    expect(r.config.cle).toBe("sk_test_x");
    expect(r.config.prix.proprietaire_direct).toBe("price_bien");
  });
});

describe("Un tarif par public, et l'un n'attend pas l'autre", () => {
  it("le tarif propriétaire suffit à faire souscrire un propriétaire", () => {
    // LE POINT DE CE DÉCOUPAGE. Le tarif agence est un objet à créer chez
    // Stripe (un barème par tranches) ; tant qu'il n'existe pas, un
    // propriétaire direct doit pouvoir payer. Exiger les deux ferait attendre
    // un public à cause de l'autre.
    poser({
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
      STRIPE_PRIX_BIEN: "price_bien",
    });
    const r = configurationStripe();
    expect(r.pret).toBe(true);
    if (!r.pret) return;
    const pd = prixPour(r.config, "proprietaire_direct");
    expect(pd.ok).toBe(true);
    if (pd.ok) expect(pd.prix).toBe("price_bien");
  });

  it("le tarif manquant se signale en nommant SA variable", () => {
    poser({
      STRIPE_SECRET_KEY: "sk_test_x",
      STRIPE_WEBHOOK_SECRET: "whsec_x",
      STRIPE_PRIX_BIEN: "price_bien",
    });
    const r = configurationStripe();
    if (!r.pret) throw new Error("configuration attendue prête");
    const agence = prixPour(r.config, "agence");
    expect(agence.ok).toBe(false);
    if (!agence.ok) {
      expect(agence.erreur).toContain("STRIPE_PRIX_LOT_AGENCE");
      // Et il dit quoi faire à celui qui le lit, qui n'est pas l'administrateur.
      expect(agence.erreur).toContain("Écrivez-nous");
    }
  });

  it("chaque public nomme sa propre variable", () => {
    expect(variablePrix("agence")).toBe("STRIPE_PRIX_LOT_AGENCE");
    expect(variablePrix("proprietaire_direct")).toBe("STRIPE_PRIX_BIEN");
  });
});

describe("Les refus de Stripe, dits à un gérant", () => {
  function erreurStripe(type: string, message: string): Error {
    const e = new Error(message);
    (e as Error & { type: string }).type = type;
    return e;
  }

  it("une panne réseau dit que rien n'a été prélevé", () => {
    const m = lireErreurStripe(erreurStripe("StripeConnectionError", "socket hang up"));
    expect(m).toContain("Rien n'a été prélevé");
    expect(m).not.toContain("socket");
  });

  it("une clé refusée oriente vers la bonne variable, et vers le bon mode", () => {
    const m = lireErreurStripe(erreurStripe("StripeAuthenticationError", "Invalid API Key"));
    expect(m).toContain("STRIPE_SECRET_KEY");
    expect(m).toContain("test");
  });

  it("un tarif inconnu ne parle pas de « price » mais de la variable à corriger", () => {
    const m = lireErreurStripe(new Error("No such price: 'price_zzz'"));
    expect(m).toContain("STRIPE_PRIX_BIEN");
  });

  it("le mélange test / réel est nommé : c'est la faute la plus fréquente", () => {
    const m = lireErreurStripe(
      new Error("a similar object exists in live mode, but a test mode key was used")
    );
    expect(m).toContain("test / réel");
  });

  it("un refus qu'on ne connaît pas garde son message d'origine", () => {
    // Inventer une phrase rassurante sur une erreur qu'on ne comprend pas,
    // c'est empêcher de la comprendre.
    const m = lireErreurStripe(new Error("Quelque chose d'inédit"));
    expect(m).toBe("Quelque chose d'inédit");
  });

  it("ce qui n'est pas une erreur ne fait pas tomber l'écran", () => {
    expect(lireErreurStripe("chaîne nue")).toContain("n'a pas répondu");
    expect(lireErreurStripe(undefined)).toContain("n'a pas répondu");
  });
});

describe("Lire une souscription, quelle que soit la version d'API", () => {
  const auSecond = 1_793_000_000;

  it("la fin de période se lit sur la ligne de facturation", () => {
    const s = { items: { data: [{ current_period_end: auSecond, quantity: 3 }] } };
    expect(finDePeriode(s as never)).toBe(new Date(auSecond * 1000).toISOString());
    expect(quantiteFacturee(s as never)).toBe(3);
  });

  it("à défaut, sur la souscription elle-même (versions antérieures)", () => {
    const s = { items: { data: [{ quantity: 1 }] }, current_period_end: auSecond };
    expect(finDePeriode(s as never)).toBe(new Date(auSecond * 1000).toISOString());
  });

  it("une souscription sans ligne ne rend ni date ni quantité inventée", () => {
    const s = { items: { data: [] } };
    expect(finDePeriode(s as never)).toBeNull();
    // Zéro, pas « une par défaut » : facturer une unité qu'on n'a pas lue
    // serait prélever au hasard.
    expect(quantiteFacturee(s as never)).toBe(0);
  });
});

// ── L'avoir de parrainage : ce que l'adaptateur décide avant d'appeler ─────
describe("porter un avoir au solde du client", () => {
  type Appel = { customer: string; corps: Record<string, unknown>; options: Record<string, unknown> };

  function faux(reponse: unknown = { id: "cbtxn_1" }) {
    const appels: Appel[] = [];
    const stripe = {
      customers: {
        createBalanceTransaction: async (
          customer: string,
          corps: Record<string, unknown>,
          options: Record<string, unknown>
        ) => {
          appels.push({ customer, corps, options });
          if (reponse instanceof Error) throw reponse;
          return reponse;
        },
      },
    };
    return { stripe, appels };
  }

  const base = { customer: "cus_1", montantCents: 4193, avantageId: "av-1", libelle: "Parrainage" };

  it("crédite, donc envoie un montant NÉGATIF — un positif ferait payer le cadeau", async () => {
    const { stripe, appels } = faux();
    const r = await crediterClientStripe(stripe as never, base);
    expect(r).toEqual({ ok: true, reference: "cbtxn_1" });
    expect(appels[0].corps).toMatchObject({ amount: -4193, currency: "eur" });
  });

  it("porte une clé d'idempotence stable : une tâche rejouée n'offre pas deux mois", async () => {
    const { stripe, appels } = faux();
    await crediterClientStripe(stripe as never, base);
    await crediterClientStripe(stripe as never, base);
    expect(appels[0].options.idempotencyKey).toBe("avantage-parrainage-av-1");
    expect(appels[1].options.idempotencyKey).toBe(appels[0].options.idempotencyKey);
  });

  it("n'appelle pas Stripe sans client, ni pour un montant qui n'en est pas un", async () => {
    const { stripe, appels } = faux();
    expect(await crediterClientStripe(stripe as never, { ...base, customer: "" })).toMatchObject({ ok: false });
    for (const montant of [0, -100, 1.5, Number.NaN]) {
      expect(await crediterClientStripe(stripe as never, { ...base, montantCents: montant })).toMatchObject({ ok: false });
    }
    expect(appels).toHaveLength(0);
  });

  it("rend l'échec sans jargon plutôt que de le laisser remonter", async () => {
    const { stripe } = faux(new Error("No such customer: cus_1"));
    const r = await crediterClientStripe(stripe as never, base);
    expect(r.ok).toBe(false);
    expect((r as { erreur: string }).erreur).toBeTruthy();
  });
});

// ── La fin d'essai passée à Stripe : souscrire ne fait pas payer plus tôt ──
describe("la fin d'essai à donner à Stripe (décision du 24/09)", () => {
  // Un « maintenant » fixe : le 24/09/2026 à midi UTC. Une règle qui dépend de
  // l'heure se vérifie à heure fixe, sinon le test change d'avis à 48 h de la
  // date qu'il cite.
  const maintenant = Date.UTC(2026, 8, 24, 12, 0, 0);
  const HEURE = 3600 * 1000;

  it("une date sans heure court jusqu'à ce jour INCLUS : la fin est minuit du lendemain", () => {
    // `essai_fin` est une colonne `date` : « 2026-10-08 » veut dire que le 8
    // est encore un jour d'essai — c'est ainsi que la base compte les jours
    // restants. Débiter le 8 à minuit du matin raccourcirait l'essai d'un jour.
    expect(finEssaiPourStripe("2026-10-08", maintenant)).toBe(Date.UTC(2026, 9, 9) / 1000);
  });

  it("un instant complet, avec heure, est pris tel quel", () => {
    const iso = "2026-10-08T15:30:00.000Z";
    expect(finEssaiPourStripe(iso, maintenant)).toBe(Math.floor(new Date(iso).getTime() / 1000));
  });

  it("à moins de 48 h de la fin, rien n'est posé : Stripe refuserait la session", () => {
    // Le 24 à midi, un essai qui finit le 25 (donc minuit le 26) est à 36 h :
    // trop court pour Stripe. Mieux vaut un prélèvement immédiat, annoncé,
    // qu'une page de paiement qui ne s'ouvre pas.
    expect(finEssaiPourStripe("2026-09-25", maintenant)).toBeUndefined();
    // Le 26 (minuit le 27, soit 60 h) passe.
    expect(finEssaiPourStripe("2026-09-26", maintenant)).toBe(Date.UTC(2026, 8, 27) / 1000);
  });

  it("la borne est stricte : 48 h pile n'est pas « plus de 48 h »", () => {
    const pile = new Date(maintenant + 48 * HEURE).toISOString();
    expect(finEssaiPourStripe(pile, maintenant)).toBeUndefined();
    const juste = new Date(maintenant + 48 * HEURE + 1000).toISOString();
    expect(finEssaiPourStripe(juste, maintenant)).toBe((maintenant + 48 * HEURE + 1000) / 1000);
  });

  it("un essai passé, absent ou illisible ne pose rien", () => {
    expect(finEssaiPourStripe("2026-09-01", maintenant)).toBeUndefined();
    expect(finEssaiPourStripe(null, maintenant)).toBeUndefined();
    expect(finEssaiPourStripe(undefined, maintenant)).toBeUndefined();
    expect(finEssaiPourStripe("", maintenant)).toBeUndefined();
    expect(finEssaiPourStripe("pas une date", maintenant)).toBeUndefined();
  });
});

describe("la page de paiement porte la fin d'essai — quand elle le peut", () => {
  function faux() {
    const appels: Record<string, unknown>[] = [];
    const stripe = {
      subscriptions: { list: async () => ({ data: [] }) },
      customers: { update: async () => ({}) },
      checkout: {
        sessions: {
          list: async () => ({ data: [] }),
          expire: async () => ({}),
          create: async (corps: Record<string, unknown>) => {
            appels.push(corps);
            return { url: "https://checkout.stripe.test/s" };
          },
        },
      },
    };
    return { stripe, appels };
  }
  const base = {
    prix: "price_bien",
    customer: "cus_1",
    quantite: 1,
    orgId: "org-1",
    retourOk: "https://x/ok",
    retourAnnule: "https://x/annule",
  };
  const dateDans = (jours: number) =>
    new Date(Date.now() + jours * 86_400_000).toISOString().slice(0, 10);

  it("un essai lointain part en `trial_end`, l'organisation restant en métadonnée", async () => {
    const { stripe, appels } = faux();
    const essaiFin = dateDans(30);
    const r = await creerSessionPaiement(stripe as never, { ...base, essaiFin });
    expect(r).toEqual({ ok: true, url: "https://checkout.stripe.test/s" });
    expect(appels[0].mode).toBe("subscription");
    expect(appels[0].subscription_data).toEqual({
      metadata: { organization_id: "org-1" },
      trial_end: Math.floor(new Date(essaiFin).getTime() / 1000) + 86_400,
    });
  });

  it("sans essai, ou trop près de sa fin, la clé `trial_end` n'apparaît pas du tout", async () => {
    // Pas `trial_end: undefined` : ce qu'on envoie doit se lire tel quel dans
    // le journal des requêtes de Stripe.
    const { stripe, appels } = faux();
    await creerSessionPaiement(stripe as never, base);
    await creerSessionPaiement(stripe as never, { ...base, essaiFin: null });
    await creerSessionPaiement(stripe as never, { ...base, essaiFin: dateDans(0) });
    expect(appels).toHaveLength(3);
    for (const corps of appels) {
      expect(corps.subscription_data).toEqual({ metadata: { organization_id: "org-1" } });
      expect("trial_end" in (corps.subscription_data as object)).toBe(false);
    }
  });
});

// ── Audit du 29/09/2026 ─────────────────────────────────────────────────────

describe("jamais deux souscriptions (audit 29/09, point 1)", () => {
  function stripeAvec(souscriptions: { id: string; status: string }[], ouvertes: string[] = []) {
    const expirees: string[] = [];
    const creees: unknown[] = [];
    const stripe = {
      subscriptions: { list: vi.fn(async () => ({ data: souscriptions })) },
      customers: { update: vi.fn(async () => ({})) },
      checkout: {
        sessions: {
          list: vi.fn(async () => ({ data: ouvertes.map((id) => ({ id })) })),
          expire: vi.fn(async (id: string) => { expirees.push(id); return {}; }),
          create: vi.fn(async (p: unknown) => { creees.push(p); return { url: "https://checkout.stripe.test/s" }; }),
        },
      },
    };
    return { stripe, expirees, creees };
  }

  it("une souscription vivante chez Stripe refuse une nouvelle page de paiement", async () => {
    const { stripe, creees } = stripeAvec([{ id: "sub_a", status: "canceled" }, { id: "sub_b", status: "past_due" }]);
    const r = await creerSessionPaiement(stripe as never, {
      prix: "price_bien", customer: "cus_1", quantite: 2, orgId: "org-1", retourOk: "https://x/ok", retourAnnule: "https://x/annule",
    });
    expect(r.ok).toBe(false);
    expect(creees).toHaveLength(0);
    expect(stripe.subscriptions.list).toHaveBeenCalledWith({ customer: "cus_1", status: "all", limit: 100 });
  });

  it("seules des souscriptions terminées : les pages restées ouvertes sont expirées, puis la nouvelle s'ouvre", async () => {
    const { stripe, expirees, creees } = stripeAvec(
      [{ id: "sub_a", status: "canceled" }, { id: "sub_c", status: "incomplete_expired" }],
      ["cs_ancienne"]
    );
    expect(await verifierAucuneSouscriptionVivante(stripe as never, "cus_1")).toEqual({ ok: true });
    expect(expirees).toEqual(["cs_ancienne"]);
    const r = await creerSessionPaiement(stripe as never, {
      prix: "price_bien", customer: "cus_1", quantite: 2, orgId: "org-1", retourOk: "https://x/ok", retourAnnule: "https://x/annule",
    });
    expect(r.ok).toBe(true);
    expect(creees).toHaveLength(1);
    // Le pied de facture suit le régime déclaré (franchise : mention 293 B).
    expect(stripe.customers.update).toHaveBeenCalledWith("cus_1", {
      invoice_settings: { footer: "TVA non applicable, art. 293 B du CGI." },
    });
  });
});

describe("le client Stripe (audit 29/09, points 6 et 12)", () => {
  function stripeClients(existant: Record<string, unknown> | "absent") {
    const creations: { corps: Record<string, unknown>; options: Record<string, unknown> }[] = [];
    const stripe = {
      customers: {
        retrieve: vi.fn(async () => {
          if (existant === "absent") throw Object.assign(new Error("No such customer: 'cus_vieux'"), { code: "resource_missing" });
          return existant;
        }),
        create: vi.fn(async (corps: Record<string, unknown>, options: Record<string, unknown>) => {
          creations.push({ corps, options });
          return { id: "cus_neuf" };
        }),
        update: vi.fn(async () => ({})),
      },
    };
    return { stripe, creations };
  }

  it("un client supprimé chez Stripe est recréé, avec une clé d'idempotence qui change, et signalé à remplacer", async () => {
    const { stripe, creations } = stripeClients({ id: "cus_vieux", deleted: true });
    const r = await assurerClientStripe(stripe as never, { orgId: "org-1", nom: "Org", email: null, existant: "cus_vieux" });
    expect(r).toEqual({ ok: true, customer: "cus_neuf", remplace: true });
    expect(creations[0].options).toEqual({ idempotencyKey: "client:org-1:cus_vieux" });
    expect(creations[0].corps).toMatchObject({
      metadata: { organization_id: "org-1" },
      invoice_settings: { footer: "TVA non applicable, art. 293 B du CGI." },
    });
  });

  it("un client introuvable (purgé) est traité comme supprimé", async () => {
    const { stripe } = stripeClients("absent");
    const r = await assurerClientStripe(stripe as never, { orgId: "org-1", nom: "Org", email: null, existant: "cus_vieux" });
    expect(r).toMatchObject({ ok: true, customer: "cus_neuf", remplace: true });
  });

  it("premier client : clé « nouveau », rien à remplacer", async () => {
    const { stripe, creations } = stripeClients({});
    const r = await assurerClientStripe(stripe as never, { orgId: "org-1", nom: "Org", email: null, existant: null });
    expect(r).toEqual({ ok: true, customer: "cus_neuf", remplace: false });
    expect(creations[0].options).toEqual({ idempotencyKey: "client:org-1:nouveau" });
  });

  it("client existant : la mention de TVA est posée si elle manque, RETIRÉE si l'éditeur est assujetti", async () => {
    const { stripe } = stripeClients({ id: "cus_1", invoice_settings: { footer: null }, metadata: { organization_id: "org-1" } });
    await assurerClientStripe(stripe as never, { orgId: "org-1", nom: "Org", email: null, existant: "cus_1" });
    expect(stripe.customers.update).toHaveBeenLastCalledWith("cus_1", {
      invoice_settings: { footer: "TVA non applicable, art. 293 B du CGI." },
    });
    const assujetti = stripeClients({ id: "cus_2", invoice_settings: { footer: "TVA non applicable, art. 293 B du CGI." } });
    await assurerClientStripe(assujetti.stripe as never, {
      orgId: "org-1", nom: "Org", email: null, existant: "cus_2", regime: { nature: "assujetti", tauxPourcent: 20 },
    });
    expect(assujetti.stripe.customers.update).toHaveBeenLastCalledWith("cus_2", { invoice_settings: { footer: "" } });
    // Déjà juste : aucun appel.
    const juste = stripeClients({ id: "cus_3", invoice_settings: { footer: "TVA non applicable, art. 293 B du CGI." } });
    await assurerClientStripe(juste.stripe as never, { orgId: "org-1", nom: "Org", email: null, existant: "cus_3" });
    expect(juste.stripe.customers.update).not.toHaveBeenCalled();
  });

  it("audit sécurité : un client Stripe d'une autre organisation est refusé", async () => {
    const autre = stripeClients({ id: "cus_x", metadata: { organization_id: "org-autre" } });
    expect((await verifierClientDeLOrganisation(autre.stripe as never, "cus_x", "org-1")).ok).toBe(false);
    const sans = stripeClients({ id: "cus_y", metadata: {} });
    expect((await verifierClientDeLOrganisation(sans.stripe as never, "cus_y", "org-1")).ok).toBe(false);
    const supprime = stripeClients({ id: "cus_z", deleted: true });
    expect((await verifierClientDeLOrganisation(supprime.stripe as never, "cus_z", "org-1")).ok).toBe(false);
    const sien = stripeClients({ id: "cus_1", metadata: { organization_id: "org-1" } });
    expect(await verifierClientDeLOrganisation(sien.stripe as never, "cus_1", "org-1")).toEqual({ ok: true });
  });
});

describe("le portail suit l'adresse publique (audit 29/09, point 12)", () => {
  function stripePortail(configs: Record<string, unknown>[]) {
    const stripe = {
      billingPortal: {
        configurations: {
          list: vi.fn(() => (async function* () { for (const c of configs) yield c; })()),
          update: vi.fn(async () => ({})),
          create: vi.fn(async () => ({ id: "bpc_neuve" })),
        },
      },
    };
    return stripe;
  }

  it("une configuration existante aux liens périmés est mise à jour, pas recréée", async () => {
    const stripe = stripePortail([
      { id: "bpc_1", metadata: { gerimmo: MARQUE_PORTAIL }, business_profile: { privacy_policy_url: "https://preprod.x/confidentialite", terms_of_service_url: "https://preprod.x/conditions" } },
    ]);
    expect(await assurerConfigurationPortail(stripe as never, "https://www.gerimmo.app")).toBe("bpc_1");
    expect(stripe.billingPortal.configurations.update).toHaveBeenCalledWith("bpc_1", {
      business_profile: { privacy_policy_url: "https://www.gerimmo.app/confidentialite", terms_of_service_url: "https://www.gerimmo.app/conditions" },
    });
    expect(stripe.billingPortal.configurations.create).not.toHaveBeenCalled();
  });

  it("liens déjà justes : aucune écriture", async () => {
    const stripe = stripePortail([
      { id: "bpc_1", metadata: { gerimmo: MARQUE_PORTAIL }, business_profile: { privacy_policy_url: "https://www.gerimmo.app/confidentialite", terms_of_service_url: "https://www.gerimmo.app/conditions" } },
    ]);
    await assurerConfigurationPortail(stripe as never, "https://www.gerimmo.app");
    expect(stripe.billingPortal.configurations.update).not.toHaveBeenCalled();
  });
});
