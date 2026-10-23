/**
 * L'action « Confirmer la rétractation » (plan de conformité du 23/10/2026, R01 et R37), sans base ni Stripe réels.
 *
 *  · la déclaration est enregistrée AVANT tout geste chez Stripe, puis exécutée, consignée, et l'accusé part ;
 *  · rejouée, elle ne refait rien de ce qui est fait (idempotence : ni second remboursement, ni second accusé) ;
 *  · hors délai, rien n'est enregistré ; un échec chez Stripe laisse la déclaration et une trace « à terminer » ;
 *  · réservée au responsable de l'espace, ou au super-administrateur permanent qui saisit un courriel reçu.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  ordre: [] as string[],
  rpc: vi.fn(),
  serviceRpc: vi.fn(),
  insert: vi.fn(async () => ({ error: null })),
  ligne: null as Record<string, unknown> | null,
  enregistree: {} as Record<string, unknown>,
  retracterSouscription: vi.fn(),
  retracterPassageAnnuel: vi.fn(),
  envoyerAccuse: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: m.rpc,
    auth: { getUser: async () => ({ data: { user: { id: "compte-1" } }, error: null }) },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  clientDeService: () => ({ rpc: m.serviceRpc, from: () => ({ insert: m.insert }) }),
}));
vi.mock("@/lib/stripe", async (importer) => {
  const vrai = await importer<typeof import("@/lib/stripe")>();
  return {
    ...vrai,
    configurationStripe: () => ({ pret: true, config: { cle: "sk_test_x", secretWebhook: "whsec_x", prix: {} } }),
    clientStripe: () => ({ subscriptions: { retrieve: vi.fn(async () => ({ id: "sub_1", start_date: 1, metadata: {} })) } }),
  };
});
vi.mock("@/lib/verrou-facturation", () => ({
  prendreVerrouFacturation: async () => ({ ok: true, proteger: <T,>(s: T) => s, rendre: async () => {} }),
}));
vi.mock("@/lib/racine-espace-serveur", () => ({ baseDeLOrganisation: async () => "/espace/org-1" }));
vi.mock("@/lib/retractation-stripe", () => ({
  retracterSouscription: m.retracterSouscription,
  retracterPassageAnnuel: m.retracterPassageAnnuel,
}));
vi.mock("@/lib/courriers-contrat-envoi", () => ({
  lireContexteCourrier: async () => ({
    organization_id: "org-1",
    organisation: "Espace fictif",
    public_tarif: "proprietaire_direct",
    stripe_subscription_id: "sub_1",
    formule: "solo",
    unites_souscrites: 1,
    essai_fin: null,
    destinataire: "titulaire@example.com",
  }),
  envoyerAccuseRetractation: m.envoyerAccuse,
}));

import { retracterAbonnement } from "@/app/actions/retractation";

function formulaire(nature = "abonnement"): FormData {
  const fd = new FormData();
  fd.set("nature", nature);
  fd.set("nom", "Camille Exemple");
  fd.set("adresse", "titulaire@example.com");
  return fd;
}

const MAINTENANT = Date.now();
const il = (jours: number) => new Date(MAINTENANT - jours * 86_400_000).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  m.ordre = [];
  m.ligne = {
    souscrit_le: il(2), abonnement_suivi: true, stripe_statut: "active", essai_fin: null, periodicite: "mensuel",
    periodicite_suivante: null, passage_annuel_demande_le: null, formule: "solo", organisation: "Espace fictif",
    destinataire: "titulaire@example.com", retractation_abonnement_le: null, retractation_passage_le: null,
  };
  m.enregistree = { id: "ret-1", declaree_le: new Date(MAINTENANT).toISOString(), executee_le: null, accuse_envoye_le: null, montant_rembourse_cents: 0 };
  m.rpc.mockImplementation(async (nom: string) => {
    if (nom === "ma_retractation") return { data: m.ligne ? [m.ligne] : [], error: null };
    if (nom === "is_permanent_super_admin") return { data: false, error: null };
    return { data: null, error: null };
  });
  m.serviceRpc.mockImplementation(async (nom: string) => {
    m.ordre.push(nom);
    if (nom === "retractation_enregistrer") return { data: [m.enregistree], error: null };
    return { data: true, error: null };
  });
  m.retracterSouscription.mockImplementation(async () => {
    m.ordre.push("stripe");
    return { montantCents: 599, refunds: [{ facture: "in_1", refund: "re_1", montant_cents: 599 }] };
  });
  m.envoyerAccuse.mockImplementation(async () => {
    m.ordre.push("accuse");
    return { envoye: true };
  });
});

describe("R01 — renoncer à l'abonnement en ligne", () => {
  it("enregistre la déclaration, puis exécute chez Stripe, consigne, envoie l'accusé et revient sur « Mon abonnement »", async () => {
    await expect(retracterAbonnement("org-1", {}, formulaire())).rejects.toMatchObject({ url: "/espace/org-1/abonnement?retractation=abonnement" });
    expect(m.ordre).toEqual(["retractation_enregistrer", "stripe", "retractation_executee", "accuse"]);
    const enregistrement = m.serviceRpc.mock.calls.find((c) => c[0] === "retractation_enregistrer")?.[1];
    expect(enregistrement).toMatchObject({ p_cle: "retractation-abonnement-sub_1", p_canal: "en_ligne", p_adresse: "titulaire@example.com", p_declaree_le: null });
    expect(String(enregistrement.p_texte)).toContain("Camille Exemple");
    expect(m.serviceRpc).toHaveBeenCalledWith("retractation_executee", { p_id: "ret-1", p_montant_cents: 599, p_refunds: [{ facture: "in_1", refund: "re_1", montant_cents: 599 }] });
    expect(m.envoyerAccuse).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cle: "retractation-abonnement-sub_1", montantRembourseCents: 599, nature: "abonnement" }));
  });

  it("rejouée après exécution et accusé : rien n'est refait (ni Stripe, ni accusé), même retour", async () => {
    m.ligne = { ...m.ligne, retractation_abonnement_le: new Date(MAINTENANT).toISOString() };
    m.enregistree = { ...m.enregistree, executee_le: new Date(MAINTENANT).toISOString(), accuse_envoye_le: new Date(MAINTENANT).toISOString(), montant_rembourse_cents: 599 };
    await expect(retracterAbonnement("org-1", {}, formulaire())).rejects.toMatchObject({ url: "/espace/org-1/abonnement?retractation=abonnement" });
    expect(m.retracterSouscription).not.toHaveBeenCalled();
    expect(m.envoyerAccuse).not.toHaveBeenCalled();
    expect(m.ordre).toEqual(["retractation_enregistrer"]);
  });

  it("rejouée après une exécution sans accusé : seul l'accusé repart, avec le montant consigné", async () => {
    m.enregistree = { ...m.enregistree, executee_le: new Date(MAINTENANT).toISOString(), montant_rembourse_cents: "599" };
    await expect(retracterAbonnement("org-1", {}, formulaire())).rejects.toMatchObject({ url: expect.stringContaining("retractation=abonnement") });
    expect(m.retracterSouscription).not.toHaveBeenCalled();
    expect(m.envoyerAccuse).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ montantRembourseCents: 599 }));
  });

  it("hors délai : refus daté, rien n'est enregistré", async () => {
    m.ligne = { ...m.ligne, souscrit_le: il(40) };
    const r = await retracterAbonnement("org-1", {}, formulaire());
    expect(r.erreur).toMatch(/Le délai de rétractation a pris fin le .* à 23 h 59 \(heure de Paris\)/);
    expect(m.serviceRpc).not.toHaveBeenCalled();
  });

  it("échec chez Stripe : la déclaration reste, une trace « à terminer », pas d'exécution consignée ni d'accusé", async () => {
    m.retracterSouscription.mockRejectedValueOnce(new Error("réseau"));
    const r = await retracterAbonnement("org-1", {}, formulaire());
    expect(r.erreur).toMatch(/^Votre déclaration est bien enregistrée/);
    expect(m.insert).toHaveBeenCalledWith({ evenement: "retractation_a_terminer", details: { organisation: "org-1", retractation: "ret-1", nature: "abonnement" } });
    expect(m.ordre).not.toContain("retractation_executee");
    expect(m.envoyerAccuse).not.toHaveBeenCalled();
  });

  it("adresse invalide ou nom absent : refus avant toute lecture", async () => {
    const fd = formulaire();
    fd.set("adresse", "pas-une-adresse");
    expect((await retracterAbonnement("org-1", {}, fd)).erreur).toMatch(/adresse électronique valide/);
    const sansNom = formulaire();
    sansNom.set("nom", " ");
    expect((await retracterAbonnement("org-1", {}, sansNom)).erreur).toMatch(/nom/);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("ni responsable ni super-administrateur permanent : refus", async () => {
    m.ligne = null;
    expect((await retracterAbonnement("org-1", {}, formulaire())).erreur).toBe("Réservé au responsable de l'espace.");
    expect(m.serviceRpc).not.toHaveBeenCalled();
  });
});

describe("R37 — renoncer au passage à l'annuel", () => {
  it("programmé : l'échéancier est libéré, la demande retirée, l'accusé dit que l'abonnement reste mensuel", async () => {
    m.ligne = { ...m.ligne, souscrit_le: il(60), periodicite_suivante: "annuel", passage_annuel_demande_le: il(1) };
    m.retracterPassageAnnuel.mockImplementation(async () => {
      m.ordre.push("stripe");
      return { montantCents: 0, refunds: [], passageEffectue: false };
    });
    await expect(retracterAbonnement("org-1", {}, formulaire("passage_annuel"))).rejects.toMatchObject({ url: "/espace/org-1/abonnement?retractation=passage" });
    expect(m.ordre).toEqual(["retractation_enregistrer", "stripe", "retractation_passage_annuel_annuler", "retractation_executee", "accuse"]);
    const cle = m.serviceRpc.mock.calls.find((c) => c[0] === "retractation_enregistrer")?.[1].p_cle;
    expect(cle).toMatch(/^retractation-passage-sub_1-\d+$/);
    expect(m.envoyerAccuse).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ nature: "passage_annuel", passageEffectue: false }));
  });

  it("sans passage demandé : rien à rétracter", async () => {
    m.ligne = { ...m.ligne, souscrit_le: il(60) };
    const r = await retracterAbonnement("org-1", {}, formulaire("passage_annuel"));
    expect(r.erreur).toMatch(/pas de délai de rétractation en cours/);
    expect(m.serviceRpc).not.toHaveBeenCalled();
  });
});
