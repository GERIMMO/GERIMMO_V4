/**
 * La traversée d'un portail artisan par la supervision (diagnostic motivé, trente minutes en lecture seule) et sa sortie.
 * Audit final du 27/10 (COD-15) : aucun test ne citait ces actions. Sans base : motif borné avant tout appel, refus de la
 * base rendu en français, redirections, et une sortie qui a lieu même quand la fermeture échoue.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), redirect: vi.fn((url: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url }); }) }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: m.rpc }) }));

import { entrerDansSessionArtisan, quitterSessionArtisan } from "@/app/actions/session-artisan";

const ARTISAN = "00000000-0000-4000-8000-000000000009";
const form = (champs: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; };

beforeEach(() => { vi.clearAllMocks(); m.rpc.mockResolvedValue({ data: null, error: null }); });

describe("entrer dans la session d'un artisan", () => {
  it.each(["", "ab", "x".repeat(1001)])("refuse un motif hors bornes (%j) avant tout appel à la base", async (motif) => {
    const retour = await entrerDansSessionArtisan(ARTISAN, {}, form({ motif }));
    expect(retour.erreur).toBe("Indiquez le motif du diagnostic (3 à 1000 caractères).");
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.redirect).not.toHaveBeenCalled();
  });

  it("un refus de la base (compte sans droit, artisan inconnu) est rendu en français, sans redirection", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "Accès refusé." } });
    const retour = await entrerDansSessionArtisan(ARTISAN, {}, form({ motif: "Facture illisible signalée par l'artisan" }));
    expect(retour.erreur).toBe("Entrée impossible : Accès refusé.");
    expect(m.redirect).not.toHaveBeenCalled();
  });

  it("cas nominal : ouvre la session avec le motif épuré, puis redirige vers le portail artisan", async () => {
    await expect(entrerDansSessionArtisan(ARTISAN, {}, form({ motif: "  Facture illisible  " }))).rejects.toMatchObject({ url: "/artisan" });
    expect(m.rpc).toHaveBeenCalledWith("ouvrir_session_artisan", { p_artisan: ARTISAN, p_motif: "Facture illisible" });
  });
});

describe("quitter la session d'un artisan", () => {
  it("ferme la traversée puis revient à la fiche du client", async () => {
    await expect(quitterSessionArtisan(form({ artisan_id: ARTISAN }))).rejects.toMatchObject({ url: `/admin/clients/artisans/${ARTISAN}` });
    expect(m.rpc).toHaveBeenCalledWith("fermer_session_artisan");
  });

  it("sans fiche de retour, revient à la liste des clients", async () => {
    await expect(quitterSessionArtisan(new FormData())).rejects.toMatchObject({ url: "/admin/clients" });
  });

  it("une fermeture refusée ne retient pas dans le portail : la sortie a lieu quand même", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { message: "indisponible" } });
    await expect(quitterSessionArtisan(form({ artisan_id: ARTISAN }))).rejects.toMatchObject({ url: `/admin/clients/artisans/${ARTISAN}` });
  });
});
