/**
 * Plan de conformité du 23/10/2026, R15 : « Programmer la fermeture » depuis /admin/donnees (actions/fermeture-compte.ts).
 * Sans base : session, clé de service, Stripe et verrou de facturation remplacés par des doublures ; aucun appel réel.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const DEMANDE = "11111111-1111-4111-8111-111111111111";
const COMPTE = "22222222-2222-4222-8222-222222222222";
const FERMETURE = "33333333-3333-4333-8333-333333333333";
const m = vi.hoisted(() => ({
  droit: { data: true as unknown, error: null as unknown },
  simulation: {} as Record<string, unknown>,
  programmation: { data: { effacement_prevu_le: "2026-11-07" } as unknown, error: null as unknown },
  annulation: { data: null as unknown, error: null as unknown },
  serviceRpc: vi.fn(),
  sessionRpc: vi.fn(),
  preparer: vi.fn(),
  annuler: vi.fn(),
  rendre: vi.fn(),
  verrou: vi.fn(),
  service: true,
  existante: null as unknown,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (nom: string, args?: Record<string, unknown>) => {
      m.sessionRpc(nom, args);
      if (nom === "is_permanent_super_admin") return m.droit;
      if (nom === "simuler_fermeture_compte") return { data: m.simulation, error: null };
      return { data: null, error: null };
    },
    auth: { getUser: async () => ({ data: { user: { id: "superviseur" } } }) },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  clientDeService: () => m.service ? {
    from: () => {
      const q: Record<string, unknown> = {};
      Object.assign(q, { select: () => q, eq: () => q, limit: () => q, maybeSingle: async () => ({ data: m.existante, error: null }) });
      return q;
    },
    rpc: async (nom: string, args: Record<string, unknown>) => {
      m.serviceRpc(nom, args);
      if (nom === "simuler_fermeture_compte") return { data: m.simulation, error: null };
      if (nom === "programmer_fermeture_compte") return m.programmation;
      if (nom === "annuler_fermeture_compte") return m.annulation;
      return { data: null, error: null };
    },
  } : null,
}));
vi.mock("@/lib/stripe", async (importer) => ({
  ...(await importer<typeof import("@/lib/stripe")>()),
  configurationStripe: () => ({ pret: true, config: { cle: "sk_test_doublure", secretWebhook: "whsec_doublure", prix: {} } }),
  clientStripe: () => ({ doublure: true }),
}));
vi.mock("@/lib/verrou-facturation", () => ({
  prendreVerrouFacturation: async (...args: unknown[]) => { m.verrou(...args); return { ok: true, rendre: m.rendre, proteger: <T,>(c: T) => c }; },
}));
vi.mock("@/lib/comptes-fermeture-serveur", () => ({ preparerStripeFermeture: m.preparer, annulerStripeFermeture: m.annuler }));
import { annulerFermetureCompte, programmerFermetureCompte } from "../src/app/actions/fermeture-compte";

function formulaire(champs: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(champs)) f.set(k, v);
  return f;
}
const ABO_PAYE = { organisation: "org-1", stripe_subscription_id: "sub_1", vivante: true, payee_en_cours: true, periode_fin: "2026-11-20T00:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  m.droit = { data: true, error: null };
  m.simulation = { abonnement: {} };
  m.programmation = { data: { effacement_prevu_le: "2026-11-07" }, error: null };
  m.service = true;
  m.existante = null;
  m.preparer.mockResolvedValue({ ok: true, remboursement: null, arret: null });
  m.annuler.mockResolvedValue({ ok: true });
});

describe("programmer la fermeture", () => {
  it("réservé au superviseur permanent avec second facteur : rien n'est lu ni écrit sinon", async () => {
    m.droit = { data: false, error: null };
    expect(await programmerFermetureCompte({}, formulaire({ account_id: COMPTE, demande_id: DEMANDE }))).toEqual({ erreur: "Réservé au compte de supervision permanent, avec second facteur." });
    expect(m.serviceRpc).not.toHaveBeenCalled();
    expect(await programmerFermetureCompte({}, formulaire({ account_id: "x", demande_id: DEMANDE }))).toMatchObject({ erreur: expect.stringContaining("rechargez") });
  });

  it("sans souscription : ni Stripe ni verrou ; programmée par la clé de service, au nom du superviseur", async () => {
    const r = await programmerFermetureCompte({}, formulaire({ account_id: COMPTE, demande_id: DEMANDE }));
    expect(r.succes).toContain("dans la nuit du 6 au 7 novembre 2026");
    expect(m.verrou).not.toHaveBeenCalled();
    expect(m.preparer).not.toHaveBeenCalled();
    expect(m.serviceRpc).toHaveBeenCalledWith("programmer_fermeture_compte", {
      p_account: COMPTE, p_origine: "super_admin", p_choix: null, p_demande_id: DEMANDE, p_par: "superviseur", p_remboursement: null, p_stripe_avant: null,
    });
  });

  it("plusieurs souscriptions vivantes, ou une souscription laissée à des gestionnaires restants : refus avant tout geste Stripe (relecture du 24/10)", async () => {
    m.simulation = { abonnement: { ...ABO_PAYE, souscriptions_vivantes: 2 }, souscriptions_laissees: [] };
    expect((await programmerFermetureCompte({}, formulaire({ account_id: COMPTE, demande_id: DEMANDE, choix: "fin_periode" }))).erreur).toMatch(/plusieurs souscriptions/);
    m.simulation = { abonnement: {}, souscriptions_laissees: ["org-2"] };
    expect((await programmerFermetureCompte({}, formulaire({ account_id: COMPTE, demande_id: DEMANDE }))).erreur).toMatch(/souscription en cours/);
    expect(m.preparer).not.toHaveBeenCalled();
    expect(m.serviceRpc).not.toHaveBeenCalledWith("programmer_fermeture_compte", expect.anything());
  });

  it("abonnement payé en cours sans choix : refus, rien chez Stripe ni en base", async () => {
    m.simulation = { abonnement: ABO_PAYE };
    expect((await programmerFermetureCompte({}, formulaire({ account_id: COMPTE, demande_id: DEMANDE }))).erreur).toMatch(/fin de la période payée/);
    expect(m.preparer).not.toHaveBeenCalled();
    expect(m.serviceRpc).not.toHaveBeenCalledWith("programmer_fermeture_compte", expect.anything());
  });

  it("J+14 : Stripe sous le verrou des gestes de facturation, puis programmation avec le remboursement calculé", async () => {
    m.simulation = { abonnement: ABO_PAYE };
    const avant = { cancel_at_period_end: true, cancel_at: null, schedule: null };
    m.preparer.mockResolvedValue({ ok: true, remboursement: { montant_cents: 420, factures: [{ facture: "in_1", montant_cents: 420 }] }, arret: "2026-11-06T23:00:00Z", avant });
    const r = await programmerFermetureCompte({}, formulaire({ account_id: COMPTE, demande_id: DEMANDE, choix: "j14_prorata" }));
    expect(m.verrou).toHaveBeenCalledWith(expect.anything(), "org-1", "resiliation");
    expect(m.preparer).toHaveBeenCalledWith({ doublure: true }, ABO_PAYE, "j14_prorata");
    expect(m.serviceRpc).toHaveBeenCalledWith("programmer_fermeture_compte", expect.objectContaining({
      p_choix: "j14_prorata", p_remboursement: { montant_cents: 420, factures: [{ facture: "in_1", montant_cents: 420 }] }, p_stripe_avant: avant }));
    expect(r.succes).toContain("remboursement");
    expect(m.rendre).toHaveBeenCalledTimes(1);
  });

  it("programmation refusée par la base : l'arrêt posé chez Stripe est défait, le verrou rendu", async () => {
    m.simulation = { abonnement: ABO_PAYE };
    m.programmation = { data: null, error: { code: "P0002", message: "Compte inconnu ou déjà effacé" } };
    const r = await programmerFermetureCompte({}, formulaire({ account_id: COMPTE, demande_id: DEMANDE, choix: "fin_periode" }));
    expect(r.erreur).toMatch(/Compte inconnu/);
    expect(m.annuler).toHaveBeenCalledWith({ doublure: true }, ABO_PAYE, "fin_periode", null);
    expect(m.rendre).toHaveBeenCalledTimes(1);
  });

  it("déjà programmée : refus avant tout geste Stripe ; programmée entre-temps (23505) : l'arrêt Stripe reste", async () => {
    m.simulation = { abonnement: ABO_PAYE };
    m.existante = { id: "f-deja" };
    expect((await programmerFermetureCompte({}, formulaire({ account_id: COMPTE, demande_id: DEMANDE, choix: "fin_periode" }))).erreur).toBe("Une fermeture est déjà programmée pour ce compte.");
    expect(m.preparer).not.toHaveBeenCalled();
    m.existante = null;
    m.programmation = { data: null, error: { code: "23505", message: "Une fermeture est déjà programmée pour ce compte" } };
    await programmerFermetureCompte({}, formulaire({ account_id: COMPTE, demande_id: DEMANDE, choix: "fin_periode" }));
    expect(m.preparer).toHaveBeenCalledTimes(1);
    expect(m.annuler).not.toHaveBeenCalled();
  });

  it("Stripe refuse : rien n'est programmé", async () => {
    m.simulation = { abonnement: ABO_PAYE };
    m.preparer.mockResolvedValue({ ok: false, erreur: "Refus du prestataire." });
    const r = await programmerFermetureCompte({}, formulaire({ account_id: COMPTE, demande_id: DEMANDE, choix: "fin_periode" }));
    expect(r.erreur).toMatch(/Stripe : Refus du prestataire\. Rien n'a été programmé\./);
    expect(m.serviceRpc).not.toHaveBeenCalledWith("programmer_fermeture_compte", expect.anything());
  });
});

describe("annuler la fermeture", () => {
  it("annulée en base ; l'arrêt Stripe levé, ou le superviseur prévenu de le lever à la main", async () => {
    const avant = { cancel_at_period_end: true, cancel_at: null, schedule: null };
    m.annulation = { data: { choix: "fin_periode", abonnement: ABO_PAYE, stripe_avant: avant }, error: null };
    expect((await annulerFermetureCompte({}, formulaire({ fermeture_id: FERMETURE, motif: "Le titulaire renonce" }))).succes).toMatch(/revient à son état d’avant la fermeture/);
    expect(m.annuler).toHaveBeenCalledWith({ doublure: true }, ABO_PAYE, "fin_periode", avant);
    m.annuler.mockResolvedValue({ ok: true, echeancierNonRetabli: true });
    expect((await annulerFermetureCompte({}, formulaire({ fermeture_id: FERMETURE, motif: "Le titulaire renonce" }))).succes).toMatch(/changement de formule programmé/);
    m.annuler.mockResolvedValue({ ok: false, erreur: "panne" });
    expect((await annulerFermetureCompte({}, formulaire({ fermeture_id: FERMETURE, motif: "Le titulaire renonce" }))).succes).toMatch(/remettez-le dans le tableau de bord Stripe/);
    m.annulation = { data: { choix: null, abonnement: {} }, error: null };
    m.annuler.mockClear();
    expect((await annulerFermetureCompte({}, formulaire({ fermeture_id: FERMETURE, motif: "Le titulaire renonce" }))).succes).toBe("Fermeture annulée : rien ne sera effacé.");
    expect(m.annuler).not.toHaveBeenCalled();
  });
});
