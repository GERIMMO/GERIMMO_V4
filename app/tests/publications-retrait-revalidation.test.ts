/**
 * Audit du 19/10 (lot mineurs, b) : un article retiré du journal répondait encore 200 pendant une heure.
 *
 * La page `/journal/[slug]` est bien en 404 pour un article archivé (`notFound()` dès que la lecture filtrée sur
 * « publiee » ne rend rien), mais elle est mise en cache une heure (`revalidate = 3600`), et `retirerPublication`
 * ne revalidait que les listes (journal, accueil, espaces, console) — jamais l'adresse de l'article ni le plan du
 * site. Même manque au retour : un article retiré puis republié gardait son 404 en cache.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), revalidate: vi.fn(), facebook: vi.fn(), page: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/facebook", () => ({ envoyerSurFacebook: mocks.facebook, RefusFacebookCertain: class extends Error {} }));
// Lecture de la Page Facebook, la même que celle de l'écran (santeFacebook), simulée : aucun appel à Meta.
vi.mock("@/lib/marketing-meta", () => ({ santeFacebook: mocks.page }));
import { RAISON_DIFFUSION_MASQUEE } from "@/lib/diffusion-facebook";
import { RefusFacebookCertain } from "@/lib/facebook";
import { publierPublicationFacebook, publierPublication, retirerPublication } from "../src/app/actions/publications";

/** Un client : l'article `id-1` porte le slug donné (ou aucun), chaque écriture réussit. */
function client(slug: string | null, titre = "Réviser un loyer") {
  const ecritures: Record<string, unknown>[] = [];
  const rpc = vi.fn(async () => ({ data: true, error: null }));
  const from = vi.fn(() => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.is = () => q;
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
  return { ecritures, rpc };
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

describe("diffusion manuelle et réservation",()=>{
  // Page « Relié » (reliée et lue) : le cas que décrit ce bloc ; les autres états ont le bloc suivant (décision du 25/11).
  beforeEach(()=>{mocks.facebook.mockReset();mocks.page.mockReset();mocks.page.mockResolvedValue({configure:true,nom:"Page Gerimmo"});});
  it.each([["jeton expiré",true],["réponse perdue",false]] as const)("conserve la bonne issue après %s",async(message,refus)=>{
    const {ecritures}=client("article");
    mocks.facebook.mockImplementationOnce(async (_article,avantEffet)=>{await avantEffet();throw refus?new RefusFacebookCertain(message):new Error(message);});
    expect(await publierPublicationFacebook("id-1")).toMatchObject({erreur:message});
    if(refus) expect(ecritures).toContainEqual({facebook_erreur:message,facebook_envoi_demarre_le:null});
    else expect(ecritures).toContainEqual({facebook_erreur:message});
  });
});

// Décision du dirigeant du 25/11/2026 : « la diffusion Facebook est masquée tant que la Page n'est pas vérifiée ». L'éditeur
// masque « Publier sur Facebook » (commit 35331720) ; l'action serveur refuse aussi, avec la même lecture que l'écran, avant
// toute réservation, toute ligne de journal et tout envoi.
describe("diffusion manuelle refusée tant que la Page Facebook n'est pas « Relié » (décision du 25/11/2026)", () => {
  beforeEach(() => {
    mocks.facebook.mockReset();
    mocks.page.mockReset();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Aucun appel réseau dans ce test."); }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });
  it.each([
    ["« À relier »", { configure: false }, RAISON_DIFFUSION_MASQUEE.a_relier],
    ["« À vérifier »", { configure: true, erreur: "Jeton de la Page expiré." }, RAISON_DIFFUSION_MASQUEE.a_verifier],
  ] as const)("Page %s : rien n'est réservé, consigné ni envoyé, la raison est dite", async (_cas, sante, raison) => {
    mocks.page.mockResolvedValue(sante);
    const { ecritures, rpc } = client("article");
    expect(await publierPublicationFacebook("id-1")).toEqual({ erreur: raison });
    expect(mocks.facebook).not.toHaveBeenCalled();
    expect(rpc.mock.calls.map((c) => (c as unknown[])[0])).toEqual(["is_permanent_super_admin"]);
    expect(ecritures).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
