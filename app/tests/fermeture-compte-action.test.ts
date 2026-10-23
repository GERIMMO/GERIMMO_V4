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
    expect(r.succes).toContain("7 novembre 2026");
    expect(m.verrou).not.toHaveBeenCalled();
    expect(m.preparer).not.toHaveBeenCalled();
    expect(m.serviceRpc).toHaveBeenCalledWith("programmer_fermeture_compte", {
      p_account: COMPTE, p_origine: "super_admin", p_choix: null, p_demande_id: DEMANDE, p_par: "superviseur", p_remboursement: null,
    });
  });

  it("abonnement payé en cours sans choix : refus, rien chez Stripe ni en base", async () => {
    m.simulation = { abonnement: ABO_PAYE };
    expect((await programmerFermetureCompte({}, formulaire({ account_id: COMPTE, demande_id: DEMANDE }))).erreur).toMatch(/fin de la période payée/);
    expect(m.preparer).not.toHaveBeenCalled();
    expect(m.serviceRpc).not.toHaveBeenCalledWith("programmer_fermeture_compte", expect.anything());
  });

  it("J+14 : Stripe sous le verrou des gestes de facturation, puis programmation avec le remboursement calculé", async () => {
    m.simulation = { abonnement: ABO_PAYE };
    m.preparer.mockResolvedValue({ ok: true, remboursement: { facture: "in_1", montant_cents: 420 }, arret: "2026-11-06T23:00:00Z" });
    const r = await programmerFermetureCompte({}, formulaire({ account_id: COMPTE, demande_id: DEMANDE, choix: "j14_prorata" }));
    expect(m.verrou).toHaveBeenCalledWith(expect.anything(), "org-1", "resiliation");
    expect(m.preparer).toHaveBeenCalledWith({ doublure: true }, ABO_PAYE, "j14_prorata");
    expect(m.serviceRpc).toHaveBeenCalledWith("programmer_fermeture_compte", expect.objectContaining({ p_choix: "j14_prorata", p_remboursement: { facture: "in_1", montant_cents: 420 } }));
    expect(r.succes).toContain("remboursement");
    expect(m.rendre).toHaveBeenCalledTimes(1);
  });

  it("programmation refusée par la base : l'arrêt posé chez Stripe est défait, le verrou rendu", async () => {
    m.simulation = { abonnement: ABO_PAYE };
    m.programmation = { data: null, error: { message: "Une fermeture est déjà programmée pour ce compte" } };
    const r = await programmerFermetureCompte({}, formulaire({ account_id: COMPTE, demande_id: DEMANDE, choix: "fin_periode" }));
    expect(r.erreur).toMatch(/déjà programmée/);
    expect(m.annuler).toHaveBeenCalledWith({ doublure: true }, ABO_PAYE, "fin_periode");
    expect(m.rendre).toHaveBeenCalledTimes(1);
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
    m.annulation = { data: { choix: "fin_periode", abonnement: ABO_PAYE }, error: null };
    expect((await annulerFermetureCompte({}, formulaire({ fermeture_id: FERMETURE, motif: "Le titulaire renonce" }))).succes).toMatch(/continue chez Stripe/);
    expect(m.annuler).toHaveBeenCalledWith({ doublure: true }, ABO_PAYE, "fin_periode");
    m.annuler.mockResolvedValue({ ok: false, erreur: "panne" });
    expect((await annulerFermetureCompte({}, formulaire({ fermeture_id: FERMETURE, motif: "Le titulaire renonce" }))).succes).toMatch(/levez-le dans le tableau de bord Stripe/);
    m.annulation = { data: { choix: null, abonnement: {} }, error: null };
    m.annuler.mockClear();
    expect((await annulerFermetureCompte({}, formulaire({ fermeture_id: FERMETURE, motif: "Le titulaire renonce" }))).succes).toBe("Fermeture annulée : rien ne sera effacé.");
    expect(m.annuler).not.toHaveBeenCalled();
  });
});
