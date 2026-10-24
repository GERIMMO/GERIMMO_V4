/**
 * Relecture adverse du 24/10 (I4) : une rétractation enregistrée dont l'exécution chez Stripe ou l'accusé n'a pas
 * abouti n'est plus oubliée. La tâche de nuit (`reprendreRetractations`) reprend chaque déclaration restée en chemin
 * (`retractations_a_terminer`), la termine sans rien doubler, avec le texte et l'adresse ENREGISTRÉS, et alerte le relais
 * de celles qu'elle ne termine pas. Sans base ni Stripe réels.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  ordre: [] as string[],
  aTerminer: [] as Record<string, unknown>[],
  rpc: vi.fn(),
  insert: vi.fn(async (_l: unknown) => ({ error: null })),
  retracterSouscription: vi.fn(),
  retracterPassageAnnuel: vi.fn(),
  envoyerAccuse: vi.fn(),
  alerter: vi.fn(async (..._a: unknown[]) => 1),
}));
vi.mock("@/lib/verrou-facturation", () => ({
  prendreVerrouFacturation: async () => ({ ok: true, proteger: <T,>(s: T) => s, rendre: async () => {} }),
}));
vi.mock("@/lib/retractation-stripe", () => ({
  retracterSouscription: m.retracterSouscription,
  retracterPassageAnnuel: m.retracterPassageAnnuel,
}));
vi.mock("@/lib/courriers-contrat-envoi", () => ({
  lireContexteCourrier: async () => ({
    organization_id: "org-1",
    organisation: "Espace fictif",
    stripe_subscription_id: "sub_1",
    formule: "solo",
    unites_souscrites: 1,
    essai_fin: null,
  }),
  envoyerAccuseRetractation: m.envoyerAccuse,
  alerterRelaisContrat: m.alerter,
}));

import { reprendreRetractations } from "@/lib/retractation-execution";
import type Stripe from "stripe";

const service = {
  rpc: m.rpc,
  from: () => ({
    insert: m.insert,
    select: () => {
      const chaine = { eq: () => chaine, maybeSingle: async () => ({ data: null, error: null }) };
      return chaine;
    },
  }),
};
const stripe = { subscriptions: { retrieve: async () => ({ id: "sub_1", metadata: {} }) } } as unknown as Stripe;

function declaration(d: Record<string, unknown> = {}) {
  return {
    id: "ret-1",
    organization_id: "org-1",
    subscription_id: "sub_1",
    nature: "abonnement",
    cle: "retractation-abonnement-sub_1",
    passage_demande_le: null,
    texte_declaration: "Je renonce à mon abonnement Gerimmo, formule Solo, souscrit le 1er octobre 2026 pour l'espace Espace fictif. Nom : Camille Exemple.",
    declaree_le: "2026-10-23T09:00:00Z",
    adresse_accuse: "titulaire@example.com",
    executee_le: null,
    montant_rembourse_cents: 0,
    passage_effectue: null,
    accuse_envoye_le: null,
    ...d,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.ordre = [];
  m.aTerminer = [declaration()];
  m.rpc.mockImplementation(async (nom: string, args: Record<string, unknown>) => {
    m.ordre.push(nom);
    if (nom === "retractations_a_terminer") return { data: m.aTerminer, error: null };
    if (nom === "retractation_executee") {
      return { data: [{ executee_le: "2026-10-24T03:00:00Z", montant_rembourse_cents: String(args.p_montant_cents), passage_effectue: null, nouvelle: true }], error: null };
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

describe("I4 — la reprise de nuit des rétractations restées en chemin", () => {
  it("une déclaration jamais exécutée est exécutée, consignée, puis accusée à l'adresse et avec le texte enregistrés", async () => {
    const bilan = await reprendreRetractations(service as never, stripe);
    expect(bilan).toEqual({ terminees: 1, echecs: [] });
    expect(m.ordre).toEqual(["retractations_a_terminer", "stripe", "retractation_executee", "accuse"]);
    expect(m.envoyerAccuse.mock.calls[0][1]).toMatchObject({
      destinataire: "titulaire@example.com",
      declaration: expect.stringContaining("Nom : Camille Exemple."),
      montantRembourseCents: 599,
      declareeLe: new Date("2026-10-23T09:00:00Z"),
    });
    expect(m.alerter).not.toHaveBeenCalled();
  });

  it("une déclaration exécutée dont l'accusé n'est pas parti : seul l'accusé part, avec le montant consigné", async () => {
    m.aTerminer = [declaration({ executee_le: "2026-10-23T09:00:05Z", montant_rembourse_cents: "599" })];
    expect(await reprendreRetractations(service as never, stripe)).toEqual({ terminees: 1, echecs: [] });
    expect(m.retracterSouscription).not.toHaveBeenCalled();
    expect(m.envoyerAccuse.mock.calls[0][1]).toMatchObject({ montantRembourseCents: 599 });
  });

  it("Stripe toujours indisponible : la déclaration reste due, le relais est alerté (sans coordonnée du client)", async () => {
    m.retracterSouscription.mockRejectedValueOnce(Object.assign(new Error("timeout"), { type: "StripeConnectionError" }));
    const bilan = await reprendreRetractations(service as never, stripe);
    expect(bilan.terminees).toBe(0);
    expect(bilan.echecs).toHaveLength(1);
    expect(bilan.echecs[0]).toContain("ret-1");
    expect(m.alerter).toHaveBeenCalledTimes(1);
    const alerte = m.alerter.mock.calls[0][1] as { evenement: string; lignes: string[] };
    expect(alerte.evenement).toBe("retractations_non_terminees");
    expect(JSON.stringify(alerte)).not.toContain("@");
    expect(m.envoyerAccuse).not.toHaveBeenCalled();
  });

  it("l'accusé qui ne part toujours pas est signalé aussi", async () => {
    m.aTerminer = [declaration({ executee_le: "2026-10-23T09:00:05Z" })];
    m.envoyerAccuse.mockResolvedValueOnce({ envoye: false, motif: "prestataire indisponible" });
    const bilan = await reprendreRetractations(service as never, stripe);
    expect(bilan.echecs[0]).toMatch(/accusé non parti, prestataire indisponible/);
    expect(m.alerter).toHaveBeenCalledTimes(1);
  });

  it("la liste illisible est un échec signalé, pas un silence", async () => {
    m.rpc.mockResolvedValueOnce({ data: null, error: { message: "indisponible" } });
    const bilan = await reprendreRetractations(service as never, stripe);
    expect(bilan).toEqual({ terminees: 0, echecs: ["lecture des rétractations à terminer impossible"] });
    expect(m.alerter).toHaveBeenCalledTimes(1);
  });
});
