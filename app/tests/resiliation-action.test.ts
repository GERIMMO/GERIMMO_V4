/**
 * « Notifier la résiliation » (plan de conformité du 23/10/2026, R04), sans base, Stripe ni Resend réels.
 *
 *  · la notification est inscrite au journal d'audit AVANT l'écriture chez Stripe (le webhook sait alors que la page
 *    envoie l'accusé) ;
 *  · un seul accusé : à l'adresse choisie, sous la clé partagée avec le webhook (`resiliation-{sub}-{fin}`), marqué
 *    par le chemin « action » ; une échéance déjà accusée n'en reçoit pas un second ;
 *  · un accusé qui ne part pas se dit (« &accuse=echec ») sans défaire la résiliation ;
 *  · revenir sur la résiliation est consigné, sans accusé.
 *
 * Relecture adverse du 24/10 : lever la résiliation efface la marque de son accusé, et la notification suivante de la
 * même échéance reçoit son propre accusé, sous une clé de rang (I3) ; une échéance déjà accusée ne fait plus croire à
 * un envoi (« &accuse=deja ») ; le nom saisi est consigné et repris dans l'accusé (M6).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const FIN_S = Math.floor(new Date("2026-11-24T09:00:00Z").getTime() / 1000);

const m = vi.hoisted(() => ({
  ordre: [] as string[],
  rpc: vi.fn(),
  serviceRpc: vi.fn(),
  resilier: vi.fn(),
  envoyerEmail: vi.fn(),
  contexte: {} as Record<string, unknown>,
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "www.gerimmo.test", "x-forwarded-proto": "https" }) }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: m.rpc,
    auth: { getUser: async () => ({ data: { user: { id: "compte-1" } }, error: null }) },
    from: () => {
      // Depuis la V1 (24/10/2026, accord exprès), lever la résiliation lit l'acceptation de la version en vigueur
      // (acceptations_cgu … limit(1)) : ici, le compte l'a acceptée (le refus est couvert par reprise-abonnement-accord).
      const q = { select: () => q, eq: () => q, limit: () => q, maybeSingle: async () => ({ data: { id: "org-1", type: "proprietaire_direct" }, error: null }) };
      return q;
    },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({ clientDeService: () => ({ rpc: m.serviceRpc }) }));
vi.mock("@/lib/email", () => ({ envoyerEmail: m.envoyerEmail }));
vi.mock("@/lib/racine-espace-serveur", () => ({ baseDeLOrganisation: async () => "/espace/org-1" }));
vi.mock("@/lib/verrou-facturation", () => ({
  prendreVerrouFacturation: async () => ({ ok: true, proteger: <T,>(s: T) => s, rendre: async () => {} }),
}));
vi.mock("@/lib/stripe", async (importer) => ({
  ...(await importer<typeof import("@/lib/stripe")>()),
  configurationStripe: () => ({ pret: true, config: { cle: "sk_test_x", secretWebhook: "whsec_x", prix: {} } }),
  clientStripe: () => ({}),
}));
vi.mock("@/lib/stripe-offres", async (importer) => ({
  ...(await importer<typeof import("@/lib/stripe-offres")>()),
  resilierAEcheance: m.resilier,
}));

import { resilierAbonnement } from "@/app/actions/abonnement";

function formulaire(resilier: "oui" | "non", adresse = "choisie@example.com"): FormData {
  const f = new FormData();
  f.set("resilier", resilier);
  f.set("nom", "Camille Exemple");
  f.set("adresse", adresse);
  return f;
}

async function redirection(p: Promise<unknown>): Promise<string> {
  return p.then((r) => { throw new Error(`aucune redirection : ${JSON.stringify(r)}`); }, (e: { url?: string }) => e.url ?? String(e));
}

beforeEach(() => {
  vi.clearAllMocks();
  m.ordre = [];
  m.contexte = {
    organization_id: "org-1", organisation: "Espace fictif", public_tarif: "proprietaire_direct", stripe_subscription_id: "sub_test",
    formule: "solo", destinataire: "facturation@example.com", resiliation_accusee_pour: null, resiliations_accusees: 0,
  };
  m.rpc.mockImplementation(async (nom: string) => (nom === "ma_souscription_stripe" ? { data: "sub_test", error: null } : { data: null, error: null }));
  m.serviceRpc.mockImplementation(async (nom: string) => {
    m.ordre.push(nom);
    if (nom === "abonnement_courrier_contexte") return { data: [m.contexte], error: null };
    return { data: true, error: null };
  });
  m.resilier.mockImplementation(async () => {
    m.ordre.push("stripe");
    return { ok: true, echeancierLibere: false, souscription: { id: "sub_test", items: { data: [{ current_period_end: FIN_S }] } } };
  });
  m.envoyerEmail.mockImplementation(async () => {
    m.ordre.push("courriel");
    return { erreur: null, id: "msg_1" };
  });
});

describe("R04 — notifier la résiliation depuis la page", () => {
  it("audit, puis Stripe, puis un accusé à l'adresse choisie, sous la clé partagée, marqué « action »", async () => {
    const url = await redirection(resilierAbonnement("org-1", {}, formulaire("oui")));
    expect(url).toBe("/espace/org-1/abonnement?resiliation=programmee");
    expect(m.ordre.indexOf("abonnement_geste_consigner")).toBeLessThan(m.ordre.indexOf("stripe"));
    expect(m.ordre.indexOf("stripe")).toBeLessThan(m.ordre.indexOf("courriel"));
    const geste = m.serviceRpc.mock.calls.find((c) => c[0] === "abonnement_geste_consigner")?.[1];
    expect(geste).toMatchObject({ p_org: "org-1", p_account: "compte-1", p_action: "abonnement_resiliation_notifiee", p_details: { souscription: "sub_test", chemin: "page" } });
    expect(JSON.stringify(geste)).not.toContain("@");
    expect(m.envoyerEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "choisie@example.com", cleIdempotence: "resiliation-sub_test-2026-11-24" }));
    expect(m.serviceRpc).toHaveBeenCalledWith("abonnement_resiliation_accusee", expect.objectContaining({ p_subscription: "sub_test", p_chemin: "action", p_message: "msg_1" }));
  });

  it("une échéance déjà accusée (par le webhook) : aucun second accusé, et l'écran dit qu'il est déjà parti (I3)", async () => {
    m.contexte = { ...m.contexte, resiliation_accusee_pour: new Date(FIN_S * 1000).toISOString(), resiliations_accusees: 1 };
    const url = await redirection(resilierAbonnement("org-1", {}, formulaire("oui")));
    expect(url).toBe("/espace/org-1/abonnement?resiliation=programmee&accuse=deja");
    expect(m.envoyerEmail).not.toHaveBeenCalled();
  });

  it("I3 : résilier, lever, résilier de nouveau la même échéance — la levée efface la marque, la seconde notification est accusée sous une clé de rang", async () => {
    // La base simulée : la marque et le rang des accusés.
    m.serviceRpc.mockImplementation(async (nom: string, args: Record<string, unknown>) => {
      m.ordre.push(nom);
      if (nom === "abonnement_courrier_contexte") return { data: [{ ...m.contexte }], error: null };
      if (nom === "abonnement_resiliation_accusee") {
        m.contexte = { ...m.contexte, resiliation_accusee_pour: args.p_periode_fin, resiliations_accusees: Number(m.contexte.resiliations_accusees) + 1 };
      }
      if (nom === "abonnement_resiliation_levee") m.contexte = { ...m.contexte, resiliation_accusee_pour: null };
      return { data: true, error: null };
    });
    const urls = [
      await redirection(resilierAbonnement("org-1", {}, formulaire("oui"))),
      await redirection(resilierAbonnement("org-1", {}, formulaire("non"))),
      await redirection(resilierAbonnement("org-1", {}, formulaire("oui", "autre@example.com"))),
    ];
    expect(urls).toEqual([
      "/espace/org-1/abonnement?resiliation=programmee",
      "/espace/org-1/abonnement?resiliation=annulee",
      "/espace/org-1/abonnement?resiliation=programmee",
    ]);
    expect(m.serviceRpc).toHaveBeenCalledWith("abonnement_resiliation_levee", { p_org: "org-1", p_subscription: "sub_test" });
    expect(m.envoyerEmail).toHaveBeenCalledTimes(2);
    expect(m.envoyerEmail.mock.calls.map((c) => [c[0].to, c[0].cleIdempotence])).toEqual([
      ["choisie@example.com", "resiliation-sub_test-2026-11-24"],
      ["autre@example.com", "resiliation-sub_test-2026-11-24-2"],
    ]);
  });

  it("M6 : le nom saisi est consigné avec la notification (sans adresse) et repris dans l'accusé", async () => {
    await redirection(resilierAbonnement("org-1", {}, formulaire("oui")));
    const geste = m.serviceRpc.mock.calls.find((c) => c[0] === "abonnement_geste_consigner")?.[1];
    expect(geste.p_details).toMatchObject({ nom: "Camille Exemple" });
    expect(m.envoyerEmail.mock.calls[0][0].html).toContain("Bonjour Camille Exemple,");
    // Un nom qui porterait une adresse n'en garde pas l'arobase (le journal n'admet aucune coordonnée).
    vi.clearAllMocks();
    const f = formulaire("oui");
    f.set("nom", "Camille x@example.com");
    await redirection(resilierAbonnement("org-1", {}, f));
    expect(JSON.stringify(m.serviceRpc.mock.calls.find((c) => c[0] === "abonnement_geste_consigner")?.[1])).not.toContain("@");
  });

  it("un accusé qui ne part pas : la résiliation reste enregistrée, l'écran le dit", async () => {
    m.envoyerEmail.mockResolvedValueOnce({ erreur: "service indisponible", id: null });
    const url = await redirection(resilierAbonnement("org-1", {}, formulaire("oui")));
    expect(url).toBe("/espace/org-1/abonnement?resiliation=programmee&accuse=echec");
    expect(m.resilier).toHaveBeenCalledOnce();
    expect(m.ordre).not.toContain("abonnement_resiliation_accusee");
  });

  it("sans adresse saisie, l'accusé part à l'adresse de facturation", async () => {
    await redirection(resilierAbonnement("org-1", {}, formulaire("oui", "")));
    expect(m.envoyerEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "facturation@example.com" }));
  });

  it("une adresse invalide est refusée avant tout geste", async () => {
    const r = await resilierAbonnement("org-1", {}, formulaire("oui", "pas-une-adresse"));
    expect(r).toEqual({ erreur: "Indiquez une adresse électronique valide pour recevoir l'accusé de réception." });
    expect(m.resilier).not.toHaveBeenCalled();
    expect(m.serviceRpc).not.toHaveBeenCalled();
  });

  it("revenir sur la résiliation est consigné, sans accusé", async () => {
    const url = await redirection(resilierAbonnement("org-1", {}, formulaire("non")));
    expect(url).toBe("/espace/org-1/abonnement?resiliation=annulee");
    expect(m.serviceRpc).toHaveBeenCalledWith("abonnement_geste_consigner", expect.objectContaining({ p_action: "abonnement_resiliation_levee" }));
    expect(m.envoyerEmail).not.toHaveBeenCalled();
  });
});
