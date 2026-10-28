/**
 * L'encaissement de support par la supervision (geste en deux temps : préparation motivée, puis exécution confirmée).
 * Audit final du 27/10 (COD-15) : aucun test ne citait l'action. Sans base : chaque entrée invalide est refusée en
 * français avant tout appel, la double vérification du superadmin est exigée, un résultat autre qu'« enregistré » n'est
 * jamais annoncé comme un encaissement, et un rejeu est dit sans doublon.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: m.rpc }) }));

import { executerEncaissementSupport, preparerEncaissementSupport } from "@/app/actions/support-encaissement";

const ORG = "00000000-0000-4000-8000-000000000001", BAIL = "00000000-0000-4000-8000-000000000002";
const APPEL = "00000000-0000-4000-8000-000000000003", GESTE = "00000000-0000-4000-8000-000000000004";
const form = (champs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; };
const preparation = (sur: Record<string, string> = {}) => form({ bailId: BAIL, appelId: APPEL, motif: "Virement reçu sur le compte séquestre, justificatif joint.", reste: "650,00", anterieure: "0", confirmation: "oui", ...sur });

beforeEach(() => {
  vi.clearAllMocks();
  m.rpc.mockImplementation(async (nom: string) => {
    if (nom === "is_permanent_super_admin") return { data: true, error: null };
    if (nom === "preparer_encaissement_support") return { data: [{ geste_id: GESTE, expire_le: "2026-10-28T10:00:00Z" }], error: null };
    if (nom === "executer_encaissement_support") return { data: { statut: "enregistre", rejoue: false }, error: null };
    return { data: null, error: null };
  });
});

describe("préparer un encaissement de support", () => {
  it.each([
    ["montant illisible", { reste: "abc" }, "Rechargez les montants de l’appel de loyer."],
    ["reste nul", { reste: "0" }, "Rechargez les montants de l’appel de loyer."],
    ["antériorité négative", { anterieure: "-1" }, "Rechargez les montants de l’appel de loyer."],
    ["identifiant d'appel invalide", { appelId: "pas-un-uuid" }, "Appel de loyer introuvable."],
    ["motif trop court", { motif: "court" }, "Indiquez un motif de support de 10 à 500 caractères."],
    ["motif trop long", { motif: "x".repeat(501) }, "Indiquez un motif de support de 10 à 500 caractères."],
    ["sans confirmation", { confirmation: "non" }, "Confirmez que le virement a déjà été reçu."],
  ])("refuse en français avant tout appel : %s", async (_cas, sur, attendu) => {
    expect(await preparerEncaissementSupport(ORG, {}, preparation(sur))).toEqual({ erreur: attendu });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("refuse une organisation qui n'est pas un identifiant", async () => {
    expect(await preparerEncaissementSupport("org", {}, preparation())).toEqual({ erreur: "Appel de loyer introuvable." });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("exige un superadmin permanent avec double vérification, sinon rien n'est préparé", async () => {
    m.rpc.mockImplementation(async (nom: string) => (nom === "is_permanent_super_admin" ? { data: false, error: null } : { data: null, error: null }));
    expect(await preparerEncaissementSupport(ORG, {}, preparation())).toEqual({ erreur: "Compte de supervision avec double vérification requis." });
    expect(m.rpc.mock.calls.map(([n]) => n)).toEqual(["is_permanent_super_admin"]);
  });

  it("un refus de la base est rendu en français ; une préparation sans geste n'annonce rien", async () => {
    m.rpc.mockImplementation(async (nom: string) => (nom === "is_permanent_super_admin" ? { data: true, error: null } : { data: null, error: { message: "Le solde a changé." } }));
    expect(await preparerEncaissementSupport(ORG, {}, preparation())).toEqual({ erreur: "Le solde a changé." });
    m.rpc.mockImplementation(async (nom: string) => (nom === "is_permanent_super_admin" ? { data: true, error: null } : { data: [], error: null }));
    expect((await preparerEncaissementSupport(ORG, {}, preparation())).erreur).toContain("Aucun encaissement n’a été ajouté");
  });

  it("cas nominal : montants à virgule décimale (champs cachés de l’écran), motif transmis, geste et échéance rendus", async () => {
    expect(await preparerEncaissementSupport(ORG, {}, preparation({ reste: "1234,56", anterieure: "12,5" }))).toEqual({ gesteId: GESTE, expireLe: "2026-10-28T10:00:00Z" });
    expect(m.rpc).toHaveBeenCalledWith("preparer_encaissement_support", {
      p_org: ORG, p_bail: BAIL, p_appel: APPEL, p_reste: 1234.56, p_anterieure: 12.5, p_motif: "Virement reçu sur le compte séquestre, justificatif joint.",
    });
  });
});

describe("exécuter un encaissement de support", () => {
  it.each([
    ["geste invalide", { gesteId: "x", confirmation: "oui" }, "Geste de support introuvable."],
    ["sans confirmation", { gesteId: GESTE, confirmation: "" }, "Confirmez l’enregistrement de cet encaissement."],
  ])("refuse avant tout appel : %s", async (_cas, champs, attendu) => {
    expect(await executerEncaissementSupport(ORG, {}, form(champs))).toEqual({ erreur: attendu });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("un résultat autre qu'« enregistré » n'est jamais annoncé comme un encaissement", async () => {
    m.rpc.mockResolvedValue({ data: { statut: "solde_change" }, error: null });
    const retour = await executerEncaissementSupport(ORG, {}, form({ gesteId: GESTE, confirmation: "oui" }));
    expect(retour.erreur).toContain("Aucun nouvel encaissement");
    expect(m.revalidate).not.toHaveBeenCalled();
  });

  it("un refus de la base est rendu en français", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "Ce geste a expiré." } });
    expect(await executerEncaissementSupport(ORG, {}, form({ gesteId: GESTE, confirmation: "oui" }))).toEqual({ erreur: "Ce geste a expiré." });
  });

  it("cas nominal : encaissement enregistré, écrans de support et des deux espaces rafraîchis ; un rejeu est dit sans doublon", async () => {
    const retour = await executerEncaissementSupport(ORG, {}, form({ gesteId: GESTE, confirmation: "oui" }));
    expect(m.rpc).toHaveBeenCalledWith("executer_encaissement_support", { p_geste: GESTE });
    expect(retour.succes).toContain("Encaissement enregistré");
    expect(m.revalidate.mock.calls).toEqual([[`/admin/organisations/${ORG}/support`], [`/agence/${ORG}`, "layout"], [`/espace/${ORG}`, "layout"]]);
    m.rpc.mockResolvedValue({ data: { statut: "enregistre", rejoue: true }, error: null });
    expect((await executerEncaissementSupport(ORG, {}, form({ gesteId: GESTE, confirmation: "oui" }))).succes).toContain("aucun doublon");
  });
});
