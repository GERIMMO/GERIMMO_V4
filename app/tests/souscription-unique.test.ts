/**
 * Défaut A01 (audit du 23/10/2026) : lib/souscription-unique.ts, branche par branche, contre un faux Stripe et un
 * registre scripté. Le parcours complet (deux onglets, action serveur) est dans
 * tests/abonnement-souscription-et-hausse-stripe.test.ts ; la base réelle dans tests/intention-souscription-base.test.ts.
 */
import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DELAI_PREPARATION_SECONDES,
  DUREE_PAGE_PAIEMENT_MINUTES,
  empreinteDemande,
  ouvrirPageDePaiementUnique,
  registreDeService,
  type DemandeSouscription,
  type IntentionLue,
  type RegistreIntentions,
} from "@/lib/souscription-unique";
import { offreParticulier } from "@/lib/tarifs";

const ID = "00000000-0000-4000-8000-000000000001";
const ID2 = "00000000-0000-4000-8000-000000000002";

const demande = (formule = 1): DemandeSouscription => ({
  offre: offreParticulier(formule, "mensuel"),
  regime: { nature: "franchise" },
  customer: "cus_1",
  orgId: "org-1",
  retourOk: "https://www.gerimmo.test/espace/org-1/abonnement?paiement=ok",
  retourAnnule: "https://www.gerimmo.test/espace/org-1/abonnement?paiement=annule",
});

function intention(o: Partial<IntentionLue> = {}): IntentionLue {
  const cree = Math.floor(Date.now() / 1000) * 1000;
  return {
    intention: ID,
    empreinte: empreinteDemande(demande()),
    stripe_session_id: null,
    url: null,
    cree_le: new Date(cree).toISOString(),
    expire_le: new Date(cree + 45 * 60_000).toISOString(),
    reprise: false,
    ...o,
  };
}

function registre(reponses: (IntentionLue | null)[], poser = true) {
  const r = {
    reserver: vi.fn(async (_org: string, _empreinte: string) => (reponses.length > 1 ? reponses.shift()! : reponses[0])),
    poserPage: vi.fn(async (_org: string, _intention: string, _session: string, _url: string) => poser),
    terminer: vi.fn(async (_org: string, _intention: string, _motif: string) => true),
  };
  return r as typeof r & RegistreIntentions;
}

function fauxStripe(o: { statutPage?: "open" | "expired" | "complete"; expireEchoue?: boolean; creationEchoue?: boolean; vivantes?: { id: string; status: string }[] } = {}) {
  const stripe = {
    products: { retrieve: vi.fn(async (id: string) => ({ id, active: true })) },
    taxRates: { list: () => (async function* () {})() },
    customers: { update: vi.fn(async () => ({})) },
    subscriptions: { list: vi.fn(async () => ({ data: o.vivantes ?? [] })) },
    checkout: {
      sessions: {
        list: vi.fn(async () => ({ data: [] })),
        retrieve: vi.fn(async (id: string) => ({ id, status: o.statutPage ?? "open" })),
        expire: vi.fn(async (id: string) => {
          if (o.expireEchoue) throw new Error("Only Checkout Sessions with a status of open can be expired.");
          return { id, status: "expired" };
        }),
        create: vi.fn(async () => {
          if (o.creationEchoue) throw Object.assign(new Error("There is currently another in-progress request using this Idempotent Key."), { type: "StripeIdempotencyError" });
          return { id: "cs_test_neuf", url: "https://checkout.stripe.test/c/pay/cs_test_neuf" };
        }),
      },
    },
  };
  return stripe as typeof stripe & Stripe;
}

beforeEach(() => vi.clearAllMocks());

describe("l'empreinte d'une demande", () => {
  it("est stable pour la même demande, change avec la formule ou le retour, et reste opaque", () => {
    expect(empreinteDemande(demande())).toBe(empreinteDemande(demande()));
    expect(empreinteDemande(demande())).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinteDemande(demande(4))).not.toBe(empreinteDemande(demande()));
    expect(empreinteDemande({ ...demande(), retourOk: "https://autre.test/ok" })).not.toBe(empreinteDemande(demande()));
    expect(empreinteDemande({ ...demande(), choix: "explicite" })).not.toBe(empreinteDemande(demande()));
  });
});

describe("ouvrirPageDePaiementUnique", () => {
  it("réservation indisponible : aucun appel qui ouvre une page", async () => {
    const stripe = fauxStripe();
    const r = await ouvrirPageDePaiementUnique(stripe, registre([null]), demande());
    expect(r).toEqual({ ok: false, erreur: expect.stringMatching(/n'a pas pu être préparée/) });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("nouvelle réservation : la page est créée, posée, puis rendue", async () => {
    const stripe = fauxStripe();
    const reg = registre([intention()]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toEqual({ ok: true, url: "https://checkout.stripe.test/c/pay/cs_test_neuf", reprise: false });
    expect(reg.poserPage).toHaveBeenCalledWith("org-1", ID, "cs_test_neuf", "https://checkout.stripe.test/c/pay/cs_test_neuf");
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ expires_at: Math.floor(Date.parse(intention().expire_le) / 1000), metadata: expect.objectContaining({ gerimmo_intention: ID }) }),
      { idempotencyKey: `souscription:${ID}` }
    );
  });

  it("page ouverte de la même demande : son adresse est rendue, aucune création", async () => {
    const stripe = fauxStripe();
    const reg = registre([intention({ stripe_session_id: "cs_test_1", url: "https://checkout.stripe.test/c/pay/cs_test_1", reprise: true })]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toEqual({ ok: true, url: "https://checkout.stripe.test/c/pay/cs_test_1", reprise: true });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
  });

  it("page de la même demande déjà payée : rien de plus, la réservation est close comme aboutie", async () => {
    const stripe = fauxStripe({ statutPage: "complete" });
    const reg = registre([intention({ stripe_session_id: "cs_test_1", url: "https://checkout.stripe.test/c/pay/cs_test_1", reprise: true })]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toMatchObject({ ok: false, erreur: expect.stringMatching(/Un paiement vient d'aboutir/) });
    expect(reg.terminer).toHaveBeenCalledWith("org-1", ID, "aboutie");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("page morte chez Stripe avant la fin de la réservation : close comme expirée, une nouvelle est ouverte", async () => {
    const stripe = fauxStripe({ statutPage: "expired" });
    const reg = registre([intention({ stripe_session_id: "cs_test_1", url: "https://checkout.stripe.test/c/pay/cs_test_1", reprise: true }), intention({ intention: ID2 })]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toMatchObject({ ok: true, url: "https://checkout.stripe.test/c/pay/cs_test_neuf" });
    expect(reg.terminer).toHaveBeenCalledWith("org-1", ID, "expiree");
  });

  it("autre demande dont la page est ouverte : la page est expirée chez Stripe AVANT la clôture et la nouvelle réservation", async () => {
    const stripe = fauxStripe();
    const ordre: string[] = [];
    stripe.checkout.sessions.expire.mockImplementation(async (id: string) => { ordre.push(`expire ${id}`); return { id, status: "expired" }; });
    const reg = registre([intention({ empreinte: "f".repeat(64), stripe_session_id: "cs_test_1", url: "https://checkout.stripe.test/c/pay/cs_test_1", reprise: true }), intention({ intention: ID2 })]);
    reg.terminer.mockImplementation(async (_o: string, i: string, m: string) => { ordre.push(`terminer ${i} ${m}`); return true; });
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toMatchObject({ ok: true });
    expect(ordre).toEqual(["expire cs_test_1", `terminer ${ID} remplacee`]);
  });

  it("autre demande dont la page vient d'être payée : aucune nouvelle page", async () => {
    const stripe = fauxStripe({ expireEchoue: true, statutPage: "complete" });
    const reg = registre([intention({ empreinte: "f".repeat(64), stripe_session_id: "cs_test_1", url: "https://checkout.stripe.test/c/pay/cs_test_1", reprise: true })]);
    // Lue « ouverte » à la reprise, payée au moment de l'expirer.
    stripe.checkout.sessions.retrieve.mockResolvedValueOnce({ id: "cs_test_1", status: "open" });
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toMatchObject({ ok: false, erreur: expect.stringMatching(/Un paiement vient d'aboutir/) });
    expect(reg.terminer).toHaveBeenCalledWith("org-1", ID, "aboutie");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("autre demande en cours d'ouverture (pas encore de page) : on attend, on ne ferme rien", async () => {
    const stripe = fauxStripe();
    const reg = registre([intention({ empreinte: "f".repeat(64), reprise: true })]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toMatchObject({ ok: false, erreur: expect.stringMatching(/en cours d'ouverture/) });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    expect(reg.terminer).not.toHaveBeenCalled();
  });

  it("deux formules qui se disputent la place : une seule fermeture par demande, pas de ping-pong", async () => {
    const stripe = fauxStripe();
    const autre = () => intention({ empreinte: "f".repeat(64), stripe_session_id: "cs_test_1", url: "https://checkout.stripe.test/c/pay/cs_test_1", reprise: true });
    const reg = registre([autre(), autre()]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toMatchObject({ ok: false, erreur: expect.stringMatching(/en cours d'ouverture/) });
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledTimes(1);
  });

  it("l'onglet qui partage la réservation échoue seul, en français, sans la rendre", async () => {
    const stripe = fauxStripe({ creationEchoue: true });
    const reg = registre([intention({ reprise: true })]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toMatchObject({ ok: false, erreur: expect.stringMatching(/en cours d'ouverture/) });
    expect(reg.terminer).not.toHaveBeenCalled();
  });

  it("la demande qui a pris la réservation et n'obtient pas de page la rend (échec)", async () => {
    const stripe = fauxStripe({ creationEchoue: true });
    const reg = registre([intention()]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r.ok).toBe(false);
    expect(reg.terminer).toHaveBeenCalledWith("org-1", ID, "echec");
  });

  it("souscription vivante chez Stripe : réservation close comme aboutie, aucune page", async () => {
    const stripe = fauxStripe({ vivantes: [{ id: "sub_1", status: "active" }] });
    const reg = registre([intention()]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toMatchObject({ ok: false, erreur: expect.stringMatching(/Un abonnement existe déjà/) });
    expect(reg.terminer).toHaveBeenCalledWith("org-1", ID, "aboutie");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("page créée mais réservation reprise entre-temps : la page est expirée aussitôt, personne ne la reçoit", async () => {
    const stripe = fauxStripe();
    const reg = registre([intention()], false);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r.ok).toBe(false);
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_test_neuf");
  });
});

describe("le registre adossé à la base", () => {
  it("appelle les fonctions de la migration avec la durée et le délai de préparation, et lit la ligne rendue", async () => {
    const rpc = vi.fn(async (nom: string) => {
      if (nom === "intention_souscription_reserver") return { data: [intention()], error: null };
      return { data: true, error: null };
    });
    const reg = registreDeService({ rpc });
    expect(await reg.reserver("org-1", "a".repeat(64))).toMatchObject({ intention: ID, reprise: false });
    expect(rpc).toHaveBeenCalledWith("intention_souscription_reserver", {
      p_org: "org-1", p_empreinte: "a".repeat(64), p_duree_minutes: DUREE_PAGE_PAIEMENT_MINUTES, p_preparation_secondes: DELAI_PREPARATION_SECONDES,
    });
    expect(DUREE_PAGE_PAIEMENT_MINUTES).toBeGreaterThan(30);
    expect(DUREE_PAGE_PAIEMENT_MINUTES).toBeLessThanOrEqual(24 * 60);
    expect(await reg.poserPage("org-1", ID, "cs_test_1", "https://checkout.stripe.test/x")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("intention_souscription_poser", { p_org: "org-1", p_intention: ID, p_session: "cs_test_1", p_url: "https://checkout.stripe.test/x" });
    expect(await reg.terminer("org-1", ID, "remplacee")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("intention_souscription_terminer", { p_org: "org-1", p_intention: ID, p_motif: "remplacee" });
  });

  it("une erreur ou une ligne mal formée vaut « pas de réservation »", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await registreDeService({ rpc: async () => ({ data: null, error: { message: "indisponible" } }) }).reserver("o", "a".repeat(64))).toBeNull();
    expect(await registreDeService({ rpc: async () => ({ data: true, error: null }) }).reserver("o", "a".repeat(64))).toBeNull();
    expect(await registreDeService({ rpc: async () => ({ data: [{ intention: "pas-un-uuid" }], error: null }) }).reserver("o", "a".repeat(64))).toBeNull();
    expect(await registreDeService({ rpc: async () => ({ data: false, error: null }) }).poserPage("o", ID, "cs_1", "https://x")).toBe(false);
  });
});
