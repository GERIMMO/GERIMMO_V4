/**
 * L'action « Confirmer la rétractation » (plan de conformité du 23/10/2026, R01 et R37), sans base ni Stripe réels.
 *
 *  · la déclaration est enregistrée AVANT tout geste chez Stripe, puis exécutée, consignée, et l'accusé part ;
 *  · rejouée, elle ne refait rien de ce qui est fait (idempotence : ni second remboursement, ni second accusé) ;
 *  · hors délai, rien n'est enregistré ; un échec chez Stripe laisse la déclaration et une trace « à terminer » ;
 *  · réservée au responsable de l'espace, ou au super-administrateur permanent qui saisit un courriel reçu.
 *
 * Relectures adverses du 24/10 : l'exécution vit dans lib/retractation-execution.ts (exercé ici avec ses vraies règles,
 * Stripe et courriels en doublure) ; l'échec du retrait en base d'un passage programmé se dit (point 2) ; une
 * déclaration de passage enregistrée se reprend même quand l'abonnement est redevenu mensuel (point 1) ; une exécution
 * déjà consignée l'emporte (point 5) ; l'accusé reprend la déclaration enregistrée ; confirmer de nouveau renvoie une
 * copie de l'accusé (M5) ; la date saisie par la supervision est lue à l'heure de Paris, serveur en UTC (point 4).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  ordre: [] as string[],
  rpc: vi.fn(),
  serviceRpc: vi.fn(),
  insert: vi.fn(async (_l: unknown) => ({ error: null })),
  ligne: null as Record<string, unknown> | null,
  enregistree: {} as Record<string, unknown>,
  consignee: null as Record<string, unknown> | null,
  contexte: {} as Record<string, unknown>,
  abonnementService: {} as Record<string, unknown>,
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
// Le client de service : les fonctions SQL (rpc), la trace technique, la relecture de la déclaration sous le verrou et
// les lectures de la saisie par la supervision.
function requete(table: string) {
  const chaine = {
    eq: () => chaine,
    maybeSingle: async () => ({ data: table === "abonnements" ? m.abonnementService : null, error: null }),
    then: (resoudre: (v: unknown) => unknown) => resoudre({ data: [], error: null }),
  };
  return chaine;
}
vi.mock("@/lib/supabase/service", () => ({
  clientDeService: () => ({ rpc: m.serviceRpc, from: (table: string) => ({ insert: m.insert, select: () => requete(table) }) }),
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
  lireContexteCourrier: async () => m.contexte,
  envoyerAccuseRetractation: m.envoyerAccuse,
  alerterRelaisContrat: async () => 0,
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
    retractation_passage_effectue: null,
  };
  m.contexte = {
    organization_id: "org-1",
    organisation: "Espace fictif",
    public_tarif: "proprietaire_direct",
    stripe_subscription_id: "sub_1",
    stripe_statut: "active",
    souscrit_le: il(2),
    formule: "solo",
    unites_souscrites: 1,
    periodicite: "mensuel",
    essai_fin: null,
    destinataire: "titulaire@example.com",
  };
  m.abonnementService = { periodicite_suivante: null, passage_annuel_demande_le: null };
  m.consignee = null;
  m.enregistree = {
    id: "ret-1",
    organization_id: "org-1",
    subscription_id: "sub_1",
    nature: "abonnement",
    cle: "retractation-abonnement-sub_1",
    passage_demande_le: null,
    texte_declaration: "Je renonce à mon abonnement Gerimmo, formule Solo, souscrit le 1er octobre 2026 pour l'espace Espace fictif. Nom : Camille Exemple.",
    declaree_le: new Date(MAINTENANT).toISOString(),
    adresse_accuse: "titulaire@example.com",
    executee_le: null,
    montant_rembourse_cents: 0,
    passage_effectue: null,
    accuse_envoye_le: null,
    nouvelle: true,
  };
  m.rpc.mockImplementation(async (nom: string) => {
    if (nom === "ma_retractation") return { data: m.ligne ? [m.ligne] : [], error: null };
    if (nom === "is_permanent_super_admin") return { data: false, error: null };
    return { data: null, error: null };
  });
  m.serviceRpc.mockImplementation(async (nom: string, args: Record<string, unknown>) => {
    m.ordre.push(nom);
    if (nom === "retractation_enregistrer") return { data: [m.enregistree], error: null };
    if (nom === "retractation_executee") {
      return {
        data: [
          m.consignee ?? {
            executee_le: new Date(MAINTENANT).toISOString(),
            montant_rembourse_cents: String(args.p_montant_cents),
            passage_effectue: args.p_passage_effectue ?? null,
            nouvelle: true,
          },
        ],
        error: null,
      };
    }
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
    expect(m.serviceRpc).toHaveBeenCalledWith("retractation_executee", {
      p_id: "ret-1",
      p_montant_cents: 599,
      p_refunds: [{ facture: "in_1", refund: "re_1", montant_cents: 599 }],
      p_passage_effectue: null,
    });
    expect(m.envoyerAccuse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ cle: "retractation-abonnement-sub_1", montantRembourseCents: 599, nature: "abonnement" }),
      expect.anything()
    );
  });

  it("l'accusé reprend la déclaration ENREGISTRÉE, même si le nom saisi au rejeu diffère", async () => {
    const fd = formulaire();
    fd.set("nom", "Autre Nom");
    m.enregistree = { ...m.enregistree, nouvelle: false };
    await expect(retracterAbonnement("org-1", {}, fd)).rejects.toMatchObject({ url: expect.stringContaining("retractation=abonnement") });
    const accuse = m.envoyerAccuse.mock.calls[0][1] as { declaration: string };
    expect(accuse.declaration).toContain("Nom : Camille Exemple.");
  });

  it("rejouée après exécution et accusé : rien n'est refait chez Stripe ; une COPIE de l'accusé part à l'adresse saisie (M5)", async () => {
    m.ligne = { ...m.ligne, retractation_abonnement_le: new Date(MAINTENANT).toISOString() };
    m.enregistree = {
      ...m.enregistree,
      nouvelle: false,
      executee_le: new Date(MAINTENANT).toISOString(),
      accuse_envoye_le: new Date(MAINTENANT).toISOString(),
      montant_rembourse_cents: 599,
    };
    const fd = formulaire();
    fd.set("adresse", "nouvelle@example.com");
    await expect(retracterAbonnement("org-1", {}, fd)).rejects.toMatchObject({ url: "/espace/org-1/abonnement?retractation=abonnement" });
    expect(m.retracterSouscription).not.toHaveBeenCalled();
    expect(m.ordre).toEqual(["retractation_enregistrer", "accuse"]);
    expect(m.envoyerAccuse).toHaveBeenCalledTimes(1);
    expect(m.envoyerAccuse.mock.calls[0][1]).toMatchObject({ destinataire: "nouvelle@example.com", montantRembourseCents: 599, copie: expect.stringMatching(/^\d+-[a-z0-9]+$/) });
  });

  it("rejouée après une exécution sans accusé : seul l'accusé repart, avec le montant consigné", async () => {
    m.enregistree = { ...m.enregistree, nouvelle: false, executee_le: new Date(MAINTENANT).toISOString(), montant_rembourse_cents: "599" };
    await expect(retracterAbonnement("org-1", {}, formulaire())).rejects.toMatchObject({ url: expect.stringContaining("retractation=abonnement") });
    expect(m.retracterSouscription).not.toHaveBeenCalled();
    expect(m.envoyerAccuse).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ montantRembourseCents: 599 }), expect.anything());
    expect((m.envoyerAccuse.mock.calls[0][1] as { copie?: string }).copie).toBeUndefined();
  });

  it("point 5 : une exécution déjà consignée par un autre passage l'emporte — l'accusé annonce le montant consigné", async () => {
    m.retracterSouscription.mockImplementationOnce(async () => ({ montantCents: 0, refunds: [] }));
    m.consignee = { executee_le: new Date(MAINTENANT).toISOString(), montant_rembourse_cents: "599", passage_effectue: null, nouvelle: false };
    await expect(retracterAbonnement("org-1", {}, formulaire())).rejects.toMatchObject({ url: expect.stringContaining("retractation=abonnement") });
    expect(m.envoyerAccuse).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ montantRembourseCents: 599 }), expect.anything());
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
    expect(r.erreur).toMatch(/nous la terminons nous-mêmes/);
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

describe("point 4 — la supervision saisit une rétractation reçue hors du bouton, serveur en UTC", () => {
  const fuseau = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "UTC"; // l'hébergeur
  });
  afterAll(() => {
    process.env.TZ = fuseau;
  });

  it("« 23:30 » le dernier jour est 23 h 30 à Paris (21 h 30 UTC en heure d'été) : reçue dans le délai", async () => {
    m.ligne = null;
    m.rpc.mockImplementation(async (nom: string) => (nom === "is_permanent_super_admin" ? { data: true, error: null } : { data: [], error: null }));
    // Souscrite le jeudi 1er octobre 2026 : dernier jour le jeudi 15 octobre.
    m.contexte = { ...m.contexte, souscrit_le: "2026-10-01T08:00:00Z" };
    const fd = formulaire();
    fd.set("recue_le", "2026-10-15T23:30");
    await expect(retracterAbonnement("org-1", {}, fd)).rejects.toMatchObject({ url: expect.stringContaining("retractation=abonnement") });
    expect(m.serviceRpc.mock.calls.find((c) => c[0] === "retractation_enregistrer")?.[1]).toMatchObject({
      p_canal: "courriel",
      p_declaree_le: "2026-10-15T21:30:00.000Z",
    });
  });

  it("une heure qui n'existe pas à Paris (passage à l'heure d'été) est refusée, jamais devinée", async () => {
    m.ligne = null;
    m.rpc.mockImplementation(async (nom: string) => (nom === "is_permanent_super_admin" ? { data: true, error: null } : { data: [], error: null }));
    const fd = formulaire();
    fd.set("recue_le", "2026-03-29T02:30");
    expect((await retracterAbonnement("org-1", {}, fd)).erreur).toMatch(/heure de Paris/);
    expect(m.serviceRpc).not.toHaveBeenCalled();
  });
});

describe("R37 — renoncer au passage à l'annuel", () => {
  beforeEach(() => {
    m.enregistree = {
      ...m.enregistree,
      nature: "passage_annuel",
      cle: "retractation-passage-sub_1-1",
      passage_demande_le: il(1),
      texte_declaration: "Je renonce au passage de mon abonnement Gerimmo à la formule annuelle, demandé le 23 octobre 2026, pour l'espace Espace fictif. Nom : Camille Exemple.",
    };
  });

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
    expect(m.serviceRpc).toHaveBeenCalledWith("retractation_executee", expect.objectContaining({ p_passage_effectue: false }));
    expect(m.envoyerAccuse).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ nature: "passage_annuel", passageEffectue: false }), expect.anything());
  });

  it("point 2 : programmé, le retrait du passage en base échoue — rien n'est consigné ni accusé, l'échec se dit et reste « à terminer »", async () => {
    m.ligne = { ...m.ligne, souscrit_le: il(60), periodicite_suivante: "annuel", passage_annuel_demande_le: il(1) };
    m.retracterPassageAnnuel.mockImplementation(async () => ({ montantCents: 0, refunds: [], passageEffectue: false }));
    const defaut = m.serviceRpc.getMockImplementation()!;
    m.serviceRpc.mockImplementation(async (nom: string, args: Record<string, unknown>) =>
      nom === "retractation_passage_annuel_annuler" ? (m.ordre.push(nom), { data: null, error: { message: "base indisponible" } }) : defaut(nom, args)
    );
    const r = await retracterAbonnement("org-1", {}, formulaire("passage_annuel"));
    expect(r.erreur).toMatch(/^Votre déclaration est bien enregistrée.*passage programmé à l'annuel n'a pas pu être retiré/);
    expect(m.ordre).not.toContain("retractation_executee");
    expect(m.envoyerAccuse).not.toHaveBeenCalled();
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ evenement: "retractation_a_terminer" }));
    expect(m.redirect).not.toHaveBeenCalled();
  });

  it("point 1 : déclaration enregistrée, l'abonnement est redevenu mensuel et le délai est passé — la reprise rembourse l'échéance annuelle et l'annonce", async () => {
    m.ligne = {
      ...m.ligne,
      souscrit_le: il(90),
      periodicite: "mensuel",
      periodicite_suivante: null,
      passage_annuel_demande_le: il(40),
      retractation_passage_le: il(30),
    };
    m.enregistree = { ...m.enregistree, nouvelle: false, passage_demande_le: il(40) };
    m.retracterPassageAnnuel.mockImplementation(async () => ({ montantCents: 5990, refunds: [{ facture: "in_an", refund: "re_an", montant_cents: 5990 }], passageEffectue: true }));
    await expect(retracterAbonnement("org-1", {}, formulaire("passage_annuel"))).rejects.toMatchObject({ url: "/espace/org-1/abonnement?retractation=passage" });
    expect(m.serviceRpc).toHaveBeenCalledWith("retractation_executee", expect.objectContaining({ p_montant_cents: 5990, p_passage_effectue: true }));
    expect(m.ordre).not.toContain("retractation_passage_annuel_annuler");
    expect(m.envoyerAccuse).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ passageEffectue: true, montantRembourseCents: 5990, mensualiteCents: 599 }),
      expect.anything()
    );
  });

  it("sans passage demandé : rien à rétracter", async () => {
    m.ligne = { ...m.ligne, souscrit_le: il(60) };
    const r = await retracterAbonnement("org-1", {}, formulaire("passage_annuel"));
    expect(r.erreur).toMatch(/pas de délai de rétractation en cours/);
    expect(m.serviceRpc).not.toHaveBeenCalled();
  });
});
