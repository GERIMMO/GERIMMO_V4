/**
 * L'import d'un parc en deux passes (contrôle, puis bascule). Audit final (COD-15, relecture du 28/10) : aucun test
 * n'importait l'action (seule la lecture CSV de src/lib/import-parc l'était). Sans base : responsable exigé, fichier
 * borné, colonnes contrôlées, le contrôle n'écrit rien et ne rafraîchit rien, la bascule rafraîchit le parc.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ acces: { user: { id: "gerant" }, role: "admin_agence" } as { user: { id: string } | null; role: string | null }, rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/ged-acces", () => ({ verifierGerant: async () => ({ supabase: { rpc: m.rpc }, ...m.acces }) }));

import { importerParc } from "@/app/actions/import-parc";
import { gabaritCsv } from "@/lib/import-parc";

const ORG = "00000000-0000-4000-8000-000000000001";
const fichier = (contenu: string, nom = "parc.csv") => new File([contenu], nom, { type: "text/csv" });
const form = (champs: Record<string, string | File>) => { const f = new FormData(); for (const [k, v] of Object.entries(champs)) f.set(k, v); return f; };

beforeEach(() => {
  vi.clearAllMocks();
  m.acces = { user: { id: "gerant" }, role: "admin_agence" };
  m.rpc.mockResolvedValue({ data: [{ ligne: 2, statut: "ok", message: "Prêt", bien_id: null, lot_id: null, bail_id: null }], error: null });
});

describe("importer un parc", () => {
  it.each([[{ user: null, role: null }], [{ user: { id: "agent" }, role: "agent" }]])("réservé au responsable (%j)", async (acces) => {
    m.acces = acces;
    expect((await importerParc(ORG, {}, form({ fichier: fichier(gabaritCsv()) }))).erreur).toContain("Réservé au responsable");
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("refuse un fichier vide, trop lourd, ou sans les colonnes obligatoires", async () => {
    expect((await importerParc(ORG, {}, form({}))).erreur).toBe("Déposez un fichier CSV.");
    expect((await importerParc(ORG, {}, form({ fichier: fichier("x".repeat(2 * 1024 * 1024 + 1)) }))).erreur).toContain("2 Mo au maximum");
    const sansColonnes = await importerParc(ORG, {}, form({ fichier: fichier("bien;ville\nTEST;Paris\n") }));
    expect(sansColonnes.erreur).toMatch(/^Colonnes obligatoires absentes/);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("premier passage : contrôle seulement, rien n'est rafraîchi, le contenu est reposé pour la bascule", async () => {
    const retour = await importerParc(ORG, {}, form({ fichier: fichier(gabaritCsv(), "mon-parc.csv") }));
    expect(m.rpc).toHaveBeenCalledWith("importer_parc", expect.objectContaining({ p_org: ORG, p_controle_seulement: true }));
    expect(retour).toMatchObject({ controle: true, fichier: "mon-parc.csv" });
    // Le texte du fichier (sans la marque d'ordre des octets, que File.text() retire) est reposé tel quel.
    expect(retour.contenu).toBe(gabaritCsv().replace(/^\uFEFF/, ""));
    expect(retour.resultats).toHaveLength(1);
    expect(m.revalidate).not.toHaveBeenCalled();
  });

  it("bascule sur le contenu reposé : écriture, parc et accueil rafraîchis ; un refus de la base est rendu en français", async () => {
    const retour = await importerParc(ORG, {}, form({ contenu: gabaritCsv(), nom_fichier: "mon-parc.csv", bascule: "1" }));
    expect(m.rpc).toHaveBeenCalledWith("importer_parc", expect.objectContaining({ p_controle_seulement: false }));
    expect(retour.controle).toBe(false);
    expect(m.revalidate.mock.calls.map(([p]) => p)).toEqual([`/agence/${ORG}/parc`, `/agence/${ORG}`]);
    m.rpc.mockResolvedValue({ data: null, error: { message: "Votre abonnement ne couvre pas ces lots." } });
    expect((await importerParc(ORG, {}, form({ contenu: gabaritCsv(), bascule: "1" }))).erreur).toBe("Votre abonnement ne couvre pas ces lots.");
  });
});
