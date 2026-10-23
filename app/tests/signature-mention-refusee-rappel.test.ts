/**
 * Constat R32 (plan de conformité du 23/10/2026) : quand la mention de la caution est refusée alors que la demande est
 * encore ouverte chez le prestataire, Gerimmo la rappelle (`annulerDemandeZoho`) pour que le bailleur ne signe pas un
 * acte non conforme ; un échec du rappel ne valide rien et sera repris. Doublure du prestataire : aucun appel réel.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
const m = vi.hoisted(() => ({ lire: vi.fn(), annuler: vi.fn(), garde: vi.fn() }));
vi.mock("@/lib/zoho-sign", () => ({ lireDemandeZoho: m.lire, annulerDemandeZoho: m.annuler, telechargerDocumentSigneZoho: vi.fn(), telechargerPreuveZoho: vi.fn(), telechargerDossierSigneZoho: vi.fn() }));
vi.mock("@/lib/controle-effets", () => ({ verifierAvantEffet: m.garde }));
import { synchroniserCircuitSignatureBail } from "@/lib/signature-bail-worker";
import { ERREUR_MENTION_CAUTION } from "@/lib/mention-caution";

const config = { prestataire: "zoho" as const, environnement: "sandbox" as const, clientId: "t", clientSecret: "t", refreshToken: "t" };
const mention = "Je m'engage en qualité de caution " + "mention complète du test ".repeat(12);
const parties = [
  { externalId: "s1", prenom: "Gaston", nom: "Garant", email: "g@example.invalid", qualite: "Garant", mentionCaution: mention },
  { externalId: "s2", prenom: "Paule", nom: "Proprio", email: "p@example.invalid", qualite: "Propriétaire" },
];
function base(erreur: string | null = null, etat = "en_cours") {
  const update = vi.fn(() => q);
  const q = { select: vi.fn(() => q), eq: vi.fn(() => q), update,
    single: vi.fn(async () => ({ data: { id: "circuit", prestataire: "zoho", modele: "cautionnement", organization_id: "org", environnement: "sandbox", etat, erreur, external_request_id: "req", external_document_id: "doc", signataires: parties }, error: null })),
    then: (ok: (v: unknown) => void) => Promise.resolve({ error: null }).then(ok) };
  const rpc = vi.fn(async (n: string) => ({ data: n === "verrouiller_signature_bail" ? true : null, error: null }));
  return { db: { rpc, from: vi.fn(() => q), storage: { from: vi.fn() } } as unknown as SupabaseClient, update, rpc };
}
const distant = (status: string, mentionRecue: string) => ({ id: "req", external_id: "circuit", status,
  signers: [{ id: "s1", email: "g@example.invalid", status: "signed", mentions: [mentionRecue] }, { id: "s2", email: "p@example.invalid", status: status === "done" ? "signed" : "notified", mentions: [] }] });

beforeEach(() => { vi.resetAllMocks(); m.garde.mockResolvedValue(undefined); m.annuler.mockResolvedValue(undefined); });

describe("mention refusée pendant que la demande est ouverte (R32)", () => {
  it("rappelle la demande chez le prestataire après avoir marqué le circuit « à vérifier »", async () => {
    m.lire.mockResolvedValue(distant("ongoing", "ok"));
    const b = base();
    await synchroniserCircuitSignatureBail(b.db, config, "circuit");
    expect(b.update).toHaveBeenCalledWith(expect.objectContaining({ etat: "a_verifier", erreur: ERREUR_MENTION_CAUTION }));
    expect(m.annuler).toHaveBeenCalledExactlyOnceWith(config, "req");
    expect(b.rpc.mock.calls.some(([n]) => n === "archiver_signature_bail")).toBe(false);
  });

  it("un rappel en échec ne valide rien et n'interrompt pas le suivi", async () => {
    m.lire.mockResolvedValue(distant("ongoing", "ok"));
    m.annuler.mockRejectedValue(new Error("HTTP 503"));
    const b = base();
    await expect(synchroniserCircuitSignatureBail(b.db, config, "circuit")).resolves.toBeUndefined();
    expect(b.update).toHaveBeenCalledWith(expect.objectContaining({ etat: "a_verifier" }));
  });

  it("une demande terminée n'est pas rappelée (impossible), elle reste sans archive", async () => {
    m.lire.mockResolvedValue(distant("done", "ok"));
    const b = base();
    await synchroniserCircuitSignatureBail(b.db, config, "circuit");
    expect(m.annuler).not.toHaveBeenCalled();
    expect(b.rpc.mock.calls.some(([n]) => n === "archiver_signature_bail")).toBe(false);
  });

  it("une mention conforme ne rappelle rien", async () => {
    m.lire.mockResolvedValue(distant("ongoing", mention));
    const b = base();
    await synchroniserCircuitSignatureBail(b.db, config, "circuit");
    expect(m.annuler).not.toHaveBeenCalled();
  });

  it("une fois rappelée, l'annulation garde le motif de la mention refusée", async () => {
    m.lire.mockResolvedValue(distant("canceled", "ok"));
    const b = base(ERREUR_MENTION_CAUTION, "a_verifier");
    await synchroniserCircuitSignatureBail(b.db, config, "circuit");
    expect(b.update).toHaveBeenCalledWith(expect.objectContaining({ etat: "annule", erreur: ERREUR_MENTION_CAUTION }));
  });
});
