/**
 * Audit du 19/10 (lot mineurs, b) : un article retiré du journal répondait encore 200 pendant une heure.
 *
 * La page `/journal/[slug]` est bien en 404 pour un article archivé (`notFound()` dès que la lecture filtrée sur
 * « publiee » ne rend rien), mais elle est mise en cache une heure (`revalidate = 3600`), et `retirerPublication`
 * ne revalidait que les listes (journal, accueil, espaces, console) — jamais l'adresse de l'article ni le plan du
 * site. Même manque au retour : un article retiré puis republié gardait son 404 en cache.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/facebook", () => ({ envoyerSurFacebook: vi.fn() }));
import { publierPublication, retirerPublication } from "../src/app/actions/publications";

/** Un client : l'article `id-1` porte le slug donné (ou aucun), chaque écriture réussit. */
function client(slug: string | null, titre = "Réviser un loyer") {
  const ecritures: Record<string, unknown>[] = [];
  const rpc = vi.fn(async () => ({ data: true, error: null }));
  const from = vi.fn(() => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.update = (valeurs: Record<string, unknown>) => {
      ecritures.push(valeurs);
      return q;
    };
    q.maybeSingle = async () => ({ data: { slug, titre, statut: "publiee" }, error: null });
    // `await supabase.from(…).update(…).eq(…)` : l'écriture résolue sans erreur.
    q.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    return q;
  });
  mocks.createClient.mockResolvedValue({ from, rpc });
  return { ecritures };
}

const chemins = () => mocks.revalidate.mock.calls.map((c) => c[0] as string);
const LISTES = ["/admin/publications", "/admin/brief", "/journal", "/agence/[orgId]", "/"];

describe("retirer un article le fait disparaître tout de suite", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.revalidate.mockReset();
  });

  it("l'adresse de l'article et le plan du site sont revalidés, en plus des listes", async () => {
    const { ecritures } = client("reviser-un-loyer");
    const resultat = await retirerPublication("id-1");
    expect(resultat.erreur).toBeUndefined();
    expect(ecritures).toEqual([{ statut: "archivee" }]);
    for (const chemin of LISTES) expect(chemins()).toContain(chemin);
    expect(chemins()).toContain("/journal/reviser-un-loyer");
    expect(chemins()).toContain("/sitemap.xml");
  });

  it("sans adresse connue (article jamais paru), aucun « /journal/null » n'est revalidé", async () => {
    client(null);
    await retirerPublication("id-1");
    expect(chemins().filter((c) => c.startsWith("/journal/"))).toEqual([]);
    expect(chemins()).toContain("/sitemap.xml");
  });

  it("faire paraître revalide aussi l'adresse de l'article (un article retiré puis republié ne reste pas en 404) et le plan du site", async () => {
    client("reviser-un-loyer");
    const resultat = await publierPublication("id-1");
    expect(resultat.erreur).toBeUndefined();
    expect(chemins()).toContain("/journal/reviser-un-loyer");
    expect(chemins()).toContain("/sitemap.xml");
  });

  it("faire paraître un article sans slug : l'adresse dérivée du titre est celle revalidée", async () => {
    const { ecritures } = client(null, "Réviser un loyer en 2026");
    await publierPublication("id-1");
    expect(ecritures[0]).toMatchObject({ statut: "publiee", slug: "reviser-un-loyer-en-2026" });
    expect(chemins()).toContain("/journal/reviser-un-loyer-en-2026");
  });
});
