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

  // ── Relecture adverse du 23/10 (mineurs A01) ─────────────────────────────────────────────────────────────────────
  const PAGE_1 = "https://checkout.stripe.test/c/pay/cs_test_1";
  const PAGE_NEUVE = "https://checkout.stripe.test/c/pay/cs_test_neuf";

  it("page non enregistrée (échec passager) : la réservation est rendue (« echec »), le message ne parle pas d'un autre onglet", async () => {
    const stripe = fauxStripe();
    const reg = registre([intention()], false);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toEqual({ ok: false, erreur: "La page de paiement n'a pas pu être enregistrée. Rien n'a été prélevé : réessayez dans un instant." });
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_test_neuf");
    // La base garde l'intention si un autre onglet y a déjà posé SA page (motif « echec » refusé dans ce cas).
    expect(reg.terminer).toHaveBeenCalledWith("org-1", ID, "echec");
  });

  it("page de la même demande à quelques secondes de son expiration : elle est fermée, une page neuve est ouverte", async () => {
    const stripe = fauxStripe();
    const bientot = new Date(Date.now() + 5_000).toISOString();
    const reg = registre([intention({ stripe_session_id: "cs_test_1", url: PAGE_1, reprise: true, expire_le: bientot }), intention({ intention: ID2 })]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toEqual({ ok: true, url: PAGE_NEUVE, reprise: false });
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_test_1");
    expect(reg.terminer).toHaveBeenCalledWith("org-1", ID, "remplacee");
  });

  it("page de la même demande avec une marge suffisante (20 min) : réutilisée", async () => {
    const stripe = fauxStripe();
    const marge = new Date(Date.now() + 20 * 60_000).toISOString();
    const reg = registre([intention({ stripe_session_id: "cs_test_1", url: PAGE_1, reprise: true, expire_le: marge })]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toEqual({ ok: true, url: PAGE_1, reprise: true });
    expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
  });

  it("page enregistrée introuvable chez Stripe (clés passées du test au réel) : la réservation est close, une page neuve est ouverte", async () => {
    const stripe = fauxStripe();
    stripe.checkout.sessions.retrieve.mockRejectedValueOnce(
      Object.assign(new Error("No such checkout.session: 'cs_test_1'; a similar object exists in test mode, but a live mode key was used to make this request."), {
        type: "StripeInvalidRequestError",
        code: "resource_missing",
      })
    );
    const reg = registre([intention({ stripe_session_id: "cs_test_1", url: PAGE_1, reprise: true }), intention({ intention: ID2 })]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toEqual({ ok: true, url: PAGE_NEUVE, reprise: false });
    expect(reg.terminer).toHaveBeenCalledWith("org-1", ID, "expiree");
  });

  it("relecture de la page impossible pour une panne passagère : la réservation est gardée, le message est en français", async () => {
    const stripe = fauxStripe();
    stripe.checkout.sessions.retrieve.mockRejectedValueOnce(Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" }));
    const reg = registre([intention({ stripe_session_id: "cs_test_1", url: PAGE_1, reprise: true })]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toMatchObject({ ok: false, erreur: expect.stringMatching(/momentanément injoignable/) });
    expect(reg.terminer).not.toHaveBeenCalled();
  });

  // ── Seconde relecture adverse du 23/10 : la pose ET la clôture tombent en panne ──────────────────────────────────────
  // La réservation reste alors en cours, sans page. Le clic suivant la reprend (même intention, donc même clé
  // d'idempotence) et Stripe lui rejoue la réponse d'origine : la page cs_test_1, que le premier clic vient d'expirer.
  it("réservation reprise sans page : la page rejouée par Stripe est relue ; expirée, elle n'est ni posée ni rendue, une page neuve est ouverte", async () => {
    const stripe = fauxStripe({ statutPage: "expired" });
    stripe.checkout.sessions.create.mockResolvedValueOnce({ id: "cs_test_1", url: PAGE_1 });
    const reg = registre([intention({ reprise: true }), intention({ intention: ID2 })]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toEqual({ ok: true, url: PAGE_NEUVE, reprise: false });
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_test_1");
    expect(reg.poserPage).not.toHaveBeenCalledWith("org-1", ID, "cs_test_1", PAGE_1);
    expect(reg.poserPage).toHaveBeenCalledWith("org-1", ID2, "cs_test_neuf", PAGE_NEUVE);
    expect(reg.terminer).toHaveBeenCalledWith("org-1", ID, "expiree");
  });

  it("réservation reprise sans page, page rejouée encore ouverte (l'autre onglet est en train de la poser) : posée et rendue", async () => {
    const stripe = fauxStripe();
    const reg = registre([intention({ reprise: true })]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toEqual({ ok: true, url: PAGE_NEUVE, reprise: true });
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_test_neuf");
    expect(reg.poserPage).toHaveBeenCalledWith("org-1", ID, "cs_test_neuf", PAGE_NEUVE);
    expect(reg.terminer).not.toHaveBeenCalled();
  });

  it("réservation reprise sans page, page rejouée déjà payée : rien de plus, la réservation est close comme aboutie", async () => {
    const stripe = fauxStripe({ statutPage: "complete" });
    const reg = registre([intention({ reprise: true })]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toMatchObject({ ok: false, erreur: expect.stringMatching(/Un paiement vient d'aboutir/) });
    expect(reg.poserPage).not.toHaveBeenCalled();
    expect(reg.terminer).toHaveBeenCalledWith("org-1", ID, "aboutie");
  });

  it("réservation reprise sans page, relecture de la page rejouée impossible : rien n'est posé, la réservation est gardée, message en français", async () => {
    const stripe = fauxStripe();
    stripe.checkout.sessions.retrieve.mockRejectedValueOnce(Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" }));
    const reg = registre([intention({ reprise: true })]);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toMatchObject({ ok: false, erreur: expect.stringMatching(/momentanément injoignable/) });
    expect(reg.poserPage).not.toHaveBeenCalled();
    expect(reg.terminer).not.toHaveBeenCalled();
  });

  it("base toujours en panne à la clôture : la page expirée rejouée n'est jamais rendue, et le message ne parle pas d'un autre onglet", async () => {
    const stripe = fauxStripe({ statutPage: "expired" });
    stripe.checkout.sessions.create.mockResolvedValue({ id: "cs_test_1", url: PAGE_1 });
    const reg = registre([intention({ reprise: true })]);
    reg.terminer.mockResolvedValue(false);
    const r = await ouvrirPageDePaiementUnique(stripe, reg, demande());
    expect(r).toEqual({ ok: false, erreur: "La page de paiement précédente a expiré et n'a pas pu être remplacée. Rien n'a été prélevé : réessayez dans un instant." });
    expect(reg.poserPage).not.toHaveBeenCalled();
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
