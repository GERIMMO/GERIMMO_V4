/**
 * La tâche de nuit, à l'approche d'une échéance (audit du 29/09/2026) :
 *  - un portefeuille au-delà de la capacité payée n'est JAMAIS facturé
 *    d'office : le client est prévenu (point 3) ;
 *  - une baisse automatique ne touche pas une offre choisie explicitement
 *    plus grande (point 11) ;
 *  - un changement de périodicité ne relève pas la capacité en douce ;
 *  - l'avis de reconduction L215-1 part avec la passe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  retrieve: vi.fn(),
  baisse: vi.fn(),
  periodicite: vi.fn(),
  avisCapacite: vi.fn(),
  avisReconduction: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ rpc: m.rpc }) }));
vi.mock("@/lib/relances-paiement", () => ({ envoyerRelancesDues: async () => ({ envoyees: 0, sans_adresse: [], echecs: [] }) }));
vi.mock("@/lib/tache", () => ({ consignerTache: vi.fn() }));
vi.mock("@/lib/avis-abonnement", () => ({
  envoyerAvisCapaciteDepassee: m.avisCapacite,
  envoyerAvisReconduction: m.avisReconduction,
}));
vi.mock("@/lib/stripe", async (importer) => {
  const vrai = await importer<typeof import("@/lib/stripe")>();
  return {
    ...vrai,
    configurationStripe: () => ({ pret: true, config: { cle: "sk_test_x", secretWebhook: "whsec_x", prix: {} } }),
    clientStripe: () => ({ subscriptions: { retrieve: m.retrieve } }),
  };
});
vi.mock("@/lib/stripe-offres", async (importer) => {
  const vrai = await importer<typeof import("@/lib/stripe-offres")>();
  return { ...vrai, appliquerBaisseAEcheance: m.baisse, programmerPeriodicite: m.periodicite };
});

import { GET } from "@/app/api/cron/abonnements/route";

const SECRET = "secret-de-recette-suffisamment-long";

type Ligne = {
  formule: string;
  unites_souscrites: number;
  unites_a_couvrir: number;
  periodicite?: "mensuel" | "annuel";
  periodicite_suivante?: "mensuel" | "annuel" | null;
};

function echeance(l: Ligne) {
  m.rpc.mockImplementation(async (nom: string) => {
    if (nom === "abonnements_echeance_a_preparer") {
      return {
        data: [{
          organization_id: "org-1",
          organisation: "Org",
          public_tarif: "proprietaire_direct",
          stripe_subscription_id: "sub_1",
          periodicite: l.periodicite ?? "mensuel",
          periodicite_suivante: l.periodicite_suivante ?? null,
          formule: l.formule,
          unites_souscrites: l.unites_souscrites,
          unites_a_couvrir: l.unites_a_couvrir,
          periode_fin: "2026-10-02T00:00:00Z",
        }],
        error: null,
      };
    }
    return { data: [], error: null };
  });
}

async function passe() {
  const r = await GET(new Request("https://x/api/cron/abonnements", { headers: { authorization: `Bearer ${SECRET}` } }));
  expect(r.status).toBe(200);
  return r.json();
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
  m.baisse.mockResolvedValue({ ok: true, echeancier: "sub_sched_1" });
  m.periodicite.mockResolvedValue({ ok: true, echeancier: "sub_sched_1" });
  m.avisCapacite.mockResolvedValue(null);
  m.avisReconduction.mockResolvedValue({ envoyes: 1, sans_adresse: [], echecs: [] });
  m.retrieve.mockResolvedValue({ id: "sub_1", metadata: { gerimmo_choix: "auto" } });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("préparer l'échéance", () => {
  it("portefeuille au-delà de la capacité : un avis, aucun changement chez Stripe (point 3)", async () => {
    echeance({ formule: "bailleur", unites_souscrites: 3, unites_a_couvrir: 5 });
    const corps = await passe();
    expect(m.baisse).not.toHaveBeenCalled();
    expect(m.periodicite).not.toHaveBeenCalled();
    expect(m.avisCapacite).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ capacite: 3, aCouvrir: 5 }));
    expect(corps.echeances).toMatchObject({ avis_capacite: 1, baisses: 0 });
  });

  it("portefeuille réduit, choix automatique : baisse programmée vers la formule qui couvre", async () => {
    echeance({ formule: "investisseur", unites_souscrites: 10, unites_a_couvrir: 2 });
    await passe();
    expect(m.baisse).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      offre: expect.objectContaining({ formule: expect.objectContaining({ code: "bailleur" }) }),
    }));
    expect(m.avisCapacite).not.toHaveBeenCalled();
  });

  it("formule choisie explicitement plus grande : pas de baisse d'office (point 11)", async () => {
    m.retrieve.mockResolvedValue({ id: "sub_1", metadata: { gerimmo_choix: "explicite" } });
    echeance({ formule: "investisseur", unites_souscrites: 10, unites_a_couvrir: 2 });
    await passe();
    expect(m.baisse).not.toHaveBeenCalled();
  });

  it("passage à l'annuel au-delà de la capacité : la périodicité change, pas la capacité", async () => {
    echeance({ formule: "bailleur", unites_souscrites: 3, unites_a_couvrir: 5, periodicite_suivante: "annuel" });
    await passe();
    expect(m.periodicite).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      offre: expect.objectContaining({ periodicite: "annuel", capacite: 3 }),
    }));
    expect(m.avisCapacite).toHaveBeenCalled();
  });

  it("l'avis de reconduction L215-1 part avec la passe", async () => {
    echeance({ formule: "bailleur", unites_souscrites: 3, unites_a_couvrir: 3 });
    const corps = await passe();
    expect(m.avisReconduction).toHaveBeenCalled();
    expect(corps.reconduction).toMatchObject({ envoyes: 1 });
  });
});
