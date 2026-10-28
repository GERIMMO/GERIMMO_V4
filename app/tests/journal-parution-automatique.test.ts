/**
 * Relecture adverse du 28/10/2026 (PUB-03) : /journal/[slug] est rendu en ISR ; un « introuvable » servi avant la
 * parution restait en cache une heure. La parution automatique rafraîchit la page de l'article et la liste.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/controle-effets", () => ({ verifierAvantEffet: vi.fn(async () => {}), ArretSupervision: class extends Error {} }));
vi.mock("@/lib/facebook", () => ({ envoyerSurFacebook: vi.fn() }));
import { diffuserPostsEchus } from "../src/lib/missions-planifiees/marketing";

beforeEach(() => vi.clearAllMocks());

function db(paru: boolean) {
  const article = { id: "a1", titre: "Titre", slug: "un-article", chapo: null, facebook_texte: null, facebook_image_url: null, facebook_envoi_demarre_le: null, veille_source_id: null };
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: article, error: null }), upsert: async () => ({ error: { message: "arrêt du test" } }) };
  return {
    rpc: async (nom: string) => (nom === "publications_marketing_echues" ? { data: ["a1"], error: null } : { data: paru, error: null }),
    from: () => q,
  };
}

describe("parution automatique d'un article", () => {
  it("rafraîchit la page de l'article et la liste du journal", async () => {
    await diffuserPostsEchus(db(true) as never, {} as never);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/journal");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/journal/un-article");
  });
  it("ne rafraîchit rien si l'article n'a pas paru", async () => {
    await diffuserPostsEchus(db(false) as never, {} as never);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
