/**
 * D06 : le nettoyage lancé à la main respecte l'arrêt d'urgence.
 *
 * `appliquer_retention` rend `arret_en_cours: true` et ne supprime rien quand un arrêt couvre la purge.
 * L'action ne doit alors ni annoncer un nettoyage terminé, ni supprimer les fichiers en attente.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { lancerPurge } from "../src/app/actions/retention";

function client(retention: unknown) {
  const supprimes: string[][] = [];
  const from = vi.fn(() => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.is = () => Promise.resolve({ data: [{ id: "f1", storage_path: "org/a.pdf" }], error: null });
    q.update = () => ({ in: () => Promise.resolve({ error: null }) });
    return q;
  });
  const storage = { from: () => ({ remove: async (chemins: string[]) => { supprimes.push(chemins); return { data: chemins.map((name) => ({ name })), error: null }; } }) };
  const rpc = vi.fn(async (nom: string) => nom === "is_super_admin" ? { data: true, error: null } : { data: retention, error: null });
  mocks.createClient.mockResolvedValue({ from, rpc, storage });
  return { supprimes, rpc };
}

describe("lancerPurge et l'arrêt d'urgence", () => {
  beforeEach(() => { mocks.createClient.mockReset(); mocks.revalidate.mockReset(); });

  it("arrêt en cours : dit que rien n'a été supprimé et ne touche pas aux fichiers en attente", async () => {
    const c = client({ arret_en_cours: true, journaux: {}, documents_purges: 0, documents_anonymises: 0 });
    const resultat = await lancerPurge();
    expect(resultat.erreur).toMatch(/arrêt d’urgence est en cours/);
    expect(resultat.erreur).toMatch(/rien n’a été supprimé/);
    expect(resultat.journaux).toBeUndefined();
    expect(c.supprimes).toEqual([]);
  });

  it("arrêt levé : comportement inchangé, les fichiers en attente sont supprimés", async () => {
    const c = client({ journaux: { tech_log: 3 }, documents_purges: 2 });
    const resultat = await lancerPurge();
    expect(resultat.erreur).toBeUndefined();
    expect(resultat).toMatchObject({ journaux: { tech_log: 3 }, documents_purges: 2, fichiers_supprimes: 1 });
    expect(c.supprimes).toEqual([["org/a.pdf"]]);
  });
});
