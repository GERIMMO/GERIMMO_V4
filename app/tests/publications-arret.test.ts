/**
 * D06 : le bouton « Chercher des sujets » respecte l'arrêt d'urgence.
 *
 * `proposer_publications` rend 0 quand un arrêt « marketing » ou « global » retient le moteur de propositions,
 * exactement comme quand il n'y a rien de neuf à proposer. L'action ne doit pas confondre les deux :
 * annoncer « la file est déjà à jour » pendant un arrêt serait faux (même cas que `lancerPurge`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { genererPropositions } from "../src/app/actions/publications";

type Arret = { cle: string };

/**
 * Un client : `proposees` est ce que rend `proposer_publications`, `arrets` les arrêts en vigueur.
 * `lectureArrets` à « echec » fait échouer la lecture de supervision_arrets.
 */
function client(proposees: number, arrets: Arret[], lectureArrets: "ok" | "echec" = "ok") {
  const appels: string[] = [];
  const filtres: { colonne: string; valeurs: unknown }[] = [];
  const rpc = vi.fn(async (nom: string) => {
    appels.push(nom);
    if (nom === "is_permanent_super_admin") return { data: true, error: null };
    if (nom === "proposer_publications") return { data: proposees, error: null };
    return { data: true, error: null };
  });
  const from = vi.fn((table: string) => {
    appels.push(`from:${table}`);
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (colonne: string, valeur: unknown) => { filtres.push({ colonne, valeurs: valeur }); return q; };
    q.in = (colonne: string, valeurs: unknown) => {
      filtres.push({ colonne, valeurs });
      // La lecture rend les arrêts demandés ET en vigueur : comme la base, qui filtre sur les clés données.
      const demandes = new Set(valeurs as string[]);
      const lignes = arrets.filter((a) => demandes.has(a.cle));
      return Promise.resolve(lectureArrets === "ok" ? { data: lignes, error: null } : { data: null, error: { message: "permission denied" } });
    };
    return q;
  });
  mocks.createClient.mockResolvedValue({ from, rpc });
  return { appels, filtres, rpc };
}

describe("genererPropositions et l'arrêt d'urgence", () => {
  beforeEach(() => { mocks.createClient.mockReset(); mocks.revalidate.mockReset(); });

  it("arrêt « marketing » : dit qu'un arrêt est en cours, pas que la file est à jour", async () => {
    client(0, [{ cle: "marketing" }]);
    const resultat = await genererPropositions();
    expect(resultat.erreur).toMatch(/arrêt d’urgence est en cours/);
    expect(resultat.erreur).toMatch(/rien n’a été proposé/);
    expect(resultat.succes).toBeUndefined();
  });

  it("arrêt « global » : même réponse", async () => {
    client(0, [{ cle: "global" }]);
    const resultat = await genererPropositions();
    expect(resultat.erreur).toMatch(/arrêt d’urgence est en cours/);
    expect(resultat.succes).toBeUndefined();
  });

  it("un arrêt qui ne retient pas ce moteur (« appels ») ne change rien : la file est à jour", async () => {
    const c = client(0, [{ cle: "appels" }]);
    const resultat = await genererPropositions();
    expect(resultat.erreur).toBeUndefined();
    expect(resultat.succes).toMatch(/la file est déjà à jour/);
    // Les clés lues sont celles que la base associe au moteur (la table de correspondance des tâches), plus « global ».
    expect(c.filtres).toContainEqual({ colonne: "cle", valeurs: ["global", "marketing"] });
  });

  it("aucun arrêt, rien de neuf : la file est à jour (comportement inchangé)", async () => {
    client(0, []);
    const resultat = await genererPropositions();
    expect(resultat.erreur).toBeUndefined();
    expect(resultat.succes).toMatch(/la file est déjà à jour/);
  });

  it("aucun arrêt, des propositions : elles sont annoncées sans lire les arrêts", async () => {
    const c = client(2, []);
    const resultat = await genererPropositions();
    expect(resultat.erreur).toBeUndefined();
    expect(resultat.succes).toMatch(/^2 nouvelles propositions dans la file\./);
    expect(c.appels).not.toContain("from:supervision_arrets");
  });

  it("lecture des arrêts en échec : n'affirme pas que la file est à jour", async () => {
    client(0, [{ cle: "marketing" }], "echec");
    const resultat = await genererPropositions();
    expect(resultat.succes).toBeUndefined();
    expect(resultat.erreur).toMatch(/arrêts d’urgence n’a pas pu être lu/);
  });
});
