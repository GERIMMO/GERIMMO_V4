/**
 * La tâche de nuit, à l'approche d'une échéance (audit du 29/09/2026) :
 *  - un portefeuille au-delà de la capacité payée n'est JAMAIS facturé
 *    d'office : le client est prévenu (point 3) ;
 *  - une baisse automatique ne touche pas une offre choisie explicitement
 *    plus grande (point 11) ;
 *  - un changement de périodicité ne relève pas la capacité en douce ;
 *  - l'avis de reconduction L215-1 part avec la passe.
 *
 * Seconde relecture adverse du 23/10 (A02) : la tâche de nuit réécrivait l'échéancier (phase en cours sans prorata,
 * métadonnées lues au départ) sans prendre le verrou des gestes de facturation ; une hausse confirmée au même moment
 * pouvait être défaite. Elle prend désormais ce verrou (opération « echeance ») autour de sa lecture et de sa
 * programmation chez Stripe ; tenu par un autre geste, ou abonnement changé chez Stripe depuis la lecture de
 * l'échéance, l'organisation n'est PAS marquée préparée : elle repasse au passage suivant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArretSupervision } from "@/lib/controle-effets";

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  retrieve: vi.fn(),
  baisse: vi.fn(),
  periodicite: vi.fn(),
  avisCapacite: vi.fn(),
  avisReconduction: vi.fn(),
  /** Le verrou des gestes de facturation, avec la sémantique de verrou_facturation_prendre / _rendre. */
  verrous: new Map<string, { jeton: string; operation: string; expire: number }>(),
  journal: [] as string[],
  verrouEnPanne: false,
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

import { traiterAbonnements as GET } from "@/lib/missions-planifiees/abonnements";
import { prendreVerrouFacturation } from "@/lib/verrou-facturation";

async function rpcVerrou(nom: string, p: Record<string, unknown>) {
  if (nom === "verrou_facturation_prendre") {
    if (m.verrouEnPanne) return { data: null, error: { message: "upstream request timeout" } };
    const tenu = m.verrous.get(p.p_org as string);
    if (tenu && tenu.expire > Date.now()) return { data: false, error: null };
    m.verrous.set(p.p_org as string, { jeton: p.p_jeton as string, operation: p.p_operation as string, expire: Date.now() + (p.p_duree_secondes as number) * 1000 });
    m.journal.push(`prendre ${p.p_operation as string}`);
    return { data: true, error: null };
  }
  if (nom === "verrou_facturation_rendre") {
    const tenu = m.verrous.get(p.p_org as string);
    if (!tenu || tenu.jeton !== p.p_jeton) return { data: false, error: null };
    m.verrous.delete(p.p_org as string);
    m.journal.push("rendre");
    return { data: true, error: null };
  }
  return null;
}

const SECRET = "secret-de-recette-suffisamment-long";

type Ligne = {
  public_tarif?: "agence" | "proprietaire_direct";
  formule: string | null;
  unites_souscrites: number;
  unites_a_couvrir: number;
  periodicite?: "mensuel" | "annuel";
  periodicite_suivante?: "mensuel" | "annuel" | null;
};

function echeance(l: Ligne) {
  m.rpc.mockImplementation(async (nom: string, p: Record<string, unknown>) => {
    const verrou = await rpcVerrou(nom, p);
    if (verrou) return verrou;
    if (nom === "abonnements_echeance_a_preparer") {
      return {
        data: [{
          organization_id: "org-1",
          organisation: "Org",
          public_tarif: l.public_tarif ?? "proprietaire_direct",
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
  m.retrieve.mockImplementation(async () => { m.journal.push("lecture stripe"); return { id: "sub_1", metadata: { gerimmo_choix: "auto" } }; });
  m.verrous.clear();
  m.journal.length = 0;
  m.verrouEnPanne = false;
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
    expect(m.avisCapacite).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ capacite: 3, aCouvrir: 5 }), expect.any(Function));
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

  it.each(["reconduction", "capacite"])("l’arrêt pendant l’avis %s remonte à la mission", async (etape) => {
    echeance({ formule: "bailleur", unites_souscrites: 3, unites_a_couvrir: etape === "capacite" ? 5 : 3 });
    const arret = new ArretSupervision();
    (etape === "capacite" ? m.avisCapacite : m.avisReconduction).mockRejectedValue(arret);
    await expect(GET(new Request("http://localhost/api/cron/abonnements", { headers: { authorization: `Bearer ${SECRET}` } }))).rejects.toBe(arret);
    expect(m.rpc.mock.calls.some(([nom]) => nom === "avantages_parrainage_a_appliquer")).toBe(false);
    if (etape === "capacite") expect(m.rpc.mock.calls.some(([nom]) => nom === "abonnement_echeance_preparee")).toBe(false);
  });

  it("un refus ordinaire d’avis conserve son bilan d’échec habituel", async () => {
    echeance({ formule: "bailleur", unites_souscrites: 3, unites_a_couvrir: 3 });
    m.avisReconduction.mockRejectedValue(new Error("Fournisseur indisponible"));
    const corps = await passe();
    expect(corps.reconduction).toEqual({ envoyes: 0, sans_adresse: [], echecs: ["Fournisseur indisponible"] });
  });
});

describe("préparer l'échéance sous le verrou des gestes de facturation (seconde relecture adverse du 23/10)", () => {
  const preparee = () => m.rpc.mock.calls.filter(([nom]) => nom === "abonnement_echeance_preparee").map(([, p]) => p);

  it("le verrou (« echeance ») est pris AVANT la lecture chez Stripe et rendu APRÈS la programmation ; une hausse lancée pendant ce temps est refusée", async () => {
    echeance({ formule: "bailleur", unites_souscrites: 3, unites_a_couvrir: 3, periodicite_suivante: "annuel" });
    let hausse: Awaited<ReturnType<typeof prendreVerrouFacturation>> | null = null;
    m.periodicite.mockImplementation(async () => {
      m.journal.push("programmation");
      // Un responsable confirme une hausse au même instant : son geste prend le même verrou, par la clé de service.
      hausse = await prendreVerrouFacturation({ rpc: m.rpc }, "org-1", "hausse");
      return { ok: true, echeancier: "sub_sched_1" };
    });
    const corps = await passe();
    expect(m.journal).toEqual(["prendre echeance", "lecture stripe", "programmation", "rendre"]);
    expect(hausse).toMatchObject({ ok: false, motif: "tenu" });
    expect(corps.echeances).toMatchObject({ periodicites: 1, echecs: [] });
    expect(preparee()).toEqual([{ p_org: "org-1", p_periode_fin: "2026-10-02T00:00:00Z", p_erreur: null }]);
    expect(m.verrous.size).toBe(0);
  });

  it("une hausse tient le verrou : rien n'est lu ni programmé chez Stripe, l'échéance n'est pas marquée préparée et repasse au prochain passage", async () => {
    echeance({ formule: "bailleur", unites_souscrites: 3, unites_a_couvrir: 5, periodicite_suivante: "annuel" });
    m.verrous.set("org-1", { jeton: "jeton-de-la-hausse", operation: "hausse", expire: Date.now() + 60_000 });
    const corps = await passe();
    expect(m.retrieve).not.toHaveBeenCalled();
    expect(m.periodicite).not.toHaveBeenCalled();
    expect(m.baisse).not.toHaveBeenCalled();
    // L'avis de capacité attend lui aussi le passage où l'échéance sera préparée.
    expect(m.avisCapacite).not.toHaveBeenCalled();
    const motif = "Une autre modification de l'abonnement était en cours : l'échéance sera préparée au prochain passage.";
    expect(corps.echeances.echecs).toEqual([{ organisation: "Org", motif }]);
    expect(preparee()).toEqual([{ p_org: "org-1", p_periode_fin: "2026-10-02T00:00:00Z", p_erreur: motif }]);
    // Le verrou de la hausse n'est pas touché.
    expect(m.verrous.get("org-1")?.jeton).toBe("jeton-de-la-hausse");
  });

  it("verrou indisponible (base) : rien chez Stripe, l'échéance repasse au prochain passage", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    echeance({ formule: "investisseur", unites_souscrites: 10, unites_a_couvrir: 2 });
    m.verrouEnPanne = true;
    const corps = await passe();
    expect(m.retrieve).not.toHaveBeenCalled();
    expect(m.baisse).not.toHaveBeenCalled();
    const motif = "Le verrou des modifications d'abonnement n'a pas pu être pris : l'échéance sera préparée au prochain passage.";
    expect(corps.echeances.echecs).toEqual([{ organisation: "Org", motif }]);
    expect(preparee()).toEqual([{ p_org: "org-1", p_periode_fin: "2026-10-02T00:00:00Z", p_erreur: motif }]);
  });

  it("hausse payée entre la lecture de l'échéance et le verrou (Stripe facture une autre formule que la ligne lue) : rien n'est programmé, l'échéance repasse", async () => {
    // La ligne lue en début de passe : Bailleur (3 biens), passage à l'annuel demandé. Entre-temps, le responsable a
    // confirmé une hausse vers Investisseur (10 biens) : sans ce contrôle, la nuit programmait « Bailleur annuel » pour la
    // période suivante, et la hausse payée était défaite à l'échéance.
    echeance({ formule: "bailleur", unites_souscrites: 3, unites_a_couvrir: 3, periodicite_suivante: "annuel" });
    m.retrieve.mockResolvedValue({
      id: "sub_1",
      metadata: { gerimmo_choix: "explicite", gerimmo_formule: "investisseur", gerimmo_unites: "10", gerimmo_grille: "2026-09-28" },
    });
    const corps = await passe();
    expect(m.baisse).not.toHaveBeenCalled();
    expect(m.periodicite).not.toHaveBeenCalled();
    const motif = "L'abonnement a changé chez Stripe depuis la lecture de l'échéance : elle sera préparée au prochain passage.";
    expect(corps.echeances.echecs).toEqual([{ organisation: "Org", motif }]);
    expect(preparee()).toEqual([{ p_org: "org-1", p_periode_fin: "2026-10-02T00:00:00Z", p_erreur: motif }]);
    expect(m.verrous.size).toBe(0);
  });

  it("agence : la base garde au moins le socle au-dessus de la métadonnée — pas un changement ; une capacité plus grande chez Stripe, si", async () => {
    // 20 lots payés, 8 à couvrir : baisse à l'échéance. Stripe annonce la même capacité, ou moins (socle côté base).
    echeance({ public_tarif: "agence", formule: null, unites_souscrites: 20, unites_a_couvrir: 8 });
    for (const unites of ["20", "12"]) {
      m.baisse.mockClear();
      m.retrieve.mockResolvedValue({ id: "sub_1", metadata: { gerimmo_choix: "auto", gerimmo_formule: "", gerimmo_unites: unites } });
      await passe();
      expect(m.baisse, unites).toHaveBeenCalledTimes(1);
    }
    // Une hausse à 30 lots vient d'être payée : la baisse calculée sur 20 lots la déferait.
    m.baisse.mockClear();
    m.retrieve.mockResolvedValue({ id: "sub_1", metadata: { gerimmo_choix: "explicite", gerimmo_formule: "", gerimmo_unites: "30" } });
    const corps = await passe();
    expect(m.baisse).not.toHaveBeenCalled();
    expect(corps.echeances.echecs).toEqual([{ organisation: "Org", motif: "L'abonnement a changé chez Stripe depuis la lecture de l'échéance : elle sera préparée au prochain passage." }]);
  });

  it("le verrou est rendu même quand l'arrêt de supervision interrompt la programmation", async () => {
    echeance({ formule: "investisseur", unites_souscrites: 10, unites_a_couvrir: 2 });
    const arret = new ArretSupervision();
    m.baisse.mockRejectedValue(arret);
    await expect(GET(new Request("http://localhost/api/cron/abonnements", { headers: { authorization: `Bearer ${SECRET}` } }))).rejects.toBe(arret);
    expect(m.verrous.size).toBe(0);
  });
});
