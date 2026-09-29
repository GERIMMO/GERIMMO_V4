/**
 * Les actions « Mon abonnement », sans Stripe ni base réels (audit du 29/09/2026).
 *
 * Ce qui est tenu ici :
 *  - un identifiant client Stripe n'est enregistré pour une organisation
 *    qu'après que le SERVEUR l'a relu chez Stripe et y a trouvé l'identifiant
 *    de cette organisation (audit sécurité) ; l'enregistrement passe par la
 *    session de l'utilisateur, jamais par la clé de service ;
 *  - une organisation restée sur la grille historique sans souscription
 *    vivante n'est plus renvoyée vers « rien à payer » : elle bascule sur la
 *    grille actuelle (point 10).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  service: vi.fn(),
  serviceRpc: vi.fn(),
  retrieve: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "www.gerimmo.test", "x-forwarded-proto": "https" }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: mocks.rpc,
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: { id: "org-1", name: "Org", type: "proprietaire_direct", email_contact: null }, error: null }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  clientDeService: () => {
    mocks.service();
    return { rpc: mocks.serviceRpc };
  },
}));
vi.mock("@/lib/stripe", async (importer) => {
  const vrai = await importer<typeof import("@/lib/stripe")>();
  return {
    ...vrai,
    configurationStripe: () => ({ pret: true, config: { cle: "sk_test_x", secretWebhook: "whsec_x", prix: {} } }),
    clientStripe: () => ({
      customers: { retrieve: mocks.retrieve, update: vi.fn(async () => ({})) },
      // La suite (page de paiement) n'est pas l'objet de ce test : elle
      // s'arrête net, après l'enregistrement du client.
      subscriptions: { list: async () => { throw new Error("arrêt du test"); } },
    }),
  };
});

import { demarrerAbonnement } from "@/app/actions/abonnement";

const PIED = "TVA non applicable, art. 293 B du CGI.";

function etat(grille: string, souscrit = false) {
  mocks.rpc.mockImplementation(async (nom: string) => {
    if (nom === "etat_abonnement") {
      return {
        data: [{ statut: "essai", essai_fin: null, public_tarif: "proprietaire_direct", unites_facturees: 0, en_ligne_possible: true, grille, unites_a_couvrir: 1, unites_souscrites: null }],
        error: null,
      };
    }
    if (nom === "mon_abonnement") {
      return { data: [{ souscrit, periodicite: "mensuel", formule: null, unites_souscrites: null, montant_periode_cents: null, stripe_statut: null }], error: null };
    }
    if (nom === "mon_client_stripe") return { data: "cus_connu", error: null };
    return { data: null, error: null };
  });
}

function souscrire(): FormData {
  const fd = new FormData();
  fd.set("confirmation", "oui");
  fd.set("periodicite", "mensuel");
  fd.set("formule", "solo");
  fd.set("montant_attendu_cents", "599");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.serviceRpc.mockResolvedValue({ data: true, error: null });
});

describe("le client Stripe appartient à l'organisation (audit sécurité 29/09)", () => {
  it("un client Stripe d'une autre organisation n'est pas enregistré", async () => {
    etat("2026-09-28");
    mocks.retrieve.mockResolvedValue({ id: "cus_connu", metadata: { organization_id: "org-autre" }, invoice_settings: { footer: PIED } });
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toMatch(/n'appartient pas à votre organisation/);
    expect(mocks.rpc.mock.calls.map((c) => c[0])).not.toContain("abonnement_client_pose");
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it("le client de l'organisation est enregistré par la session de l'utilisateur, pas par la clé de service", async () => {
    etat("2026-09-28");
    mocks.retrieve.mockResolvedValue({ id: "cus_connu", metadata: { organization_id: "org-1" }, invoice_settings: { footer: PIED } });
    const r = await demarrerAbonnement("org-1", {}, souscrire());
    expect(r.erreur).toBeDefined(); // la page de paiement s'arrête (voir le faux Stripe)
    expect(mocks.rpc).toHaveBeenCalledWith("abonnement_client_pose", { p_org: "org-1", p_customer: "cus_connu" });
    expect(mocks.service).not.toHaveBeenCalled();
  });
});

describe("grille historique sans souscription vivante (audit 29/09, point 10)", () => {
  it("bascule sur la grille actuelle et renvoie vers les formules — plus de « rien à payer »", async () => {
    etat("historique");
    await expect(demarrerAbonnement("org-1", {}, new FormData())).rejects.toMatchObject({
      url: "/agence/org-1/abonnement?grille=actuelle",
    });
    expect(mocks.serviceRpc).toHaveBeenCalledWith("abonnement_basculer_grille", { p_org: "org-1" });
  });

  it("une souscription historique vivante n'est pas basculée : elle se gère dans le portail", async () => {
    etat("historique", true);
    const r = await demarrerAbonnement("org-1", {}, new FormData());
    expect(r.erreur).toMatch(/ancienne grille/);
    expect(mocks.service).not.toHaveBeenCalled();
  });
});
