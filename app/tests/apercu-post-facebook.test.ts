/**
 * Lot L4 du plan de correction du 26/11/2026, point D1 (reste du lot D1 du 24/11, JOURNAL.md : « les aperçus du post
 * Facebook ne montrent ni le lien ni la mention ») : sur « Marketing et contenus », l'aperçu d'un post programmé montrait
 * le texte préparé seul. Le message réellement envoyé (lib/facebook.ts, texteFacebook) se termine par « Lire l’article :
 * <adresse> » et, pour un article d'origine « ia », par « Rédigé avec l’aide de l’IA » (décision Q13). L'aperçu montre
 * désormais ce message, calculé côté serveur avec les champs que la mission de diffusion transmet
 * (lib/missions-planifiees/marketing.ts, diffuserPostsEchus). Rendu sans base (données fictives), avec les vrais
 * composants de l'écran.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { texteFacebook } from "@/lib/facebook";
import { MENTION_IA_ARTICLE } from "@/components/mention-ia-article";

type Filtres = { table: string; eq: Record<string, unknown> };
const banc = vi.hoisted(() => ({
  programmes: [] as Record<string, unknown>[],
}));
function requete(table: string) {
  const f: Filtres = { table, eq: {} };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "contains", "neq", "is", "in", "or", "not", "lt", "like", "gte", "order", "limit", "range"]) q[m] = () => q;
  q.eq = (cle: string, valeur: unknown) => { f.eq[cle] = valeur; return q; };
  const reponse = () => f.table === "publications" && f.eq.statut === "programmee"
    ? { data: banc.programmes, error: null, count: banc.programmes.length }
    : f.table === "marketing_reglages"
      ? { data: { actif: true, publication_automatique: true, publicite_active: false, jours_semaine: [2, 5], heure_paris: 9, heure_preparation_paris: 18, budget_mensuel_cents: 0, validation_obligatoire: true, veille_mots_inclus: [], veille_mots_exclus: [] }, error: null, count: null }
      : { data: [], error: null, count: 0 };
  q.single = () => Promise.resolve(reponse());
  q.maybeSingle = q.single;
  q.then = (ok: (r: unknown) => unknown) => Promise.resolve(reponse()).then(ok);
  return q;
}
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: requete,
    rpc: async (nom: string) => ({ data: nom === "ia_disponible" ? true : null, error: null }),
    auth: { getUser: async () => ({ data: { user: { id: "superviseur-fictif" } }, error: null }) },
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }), notFound: () => { throw Error("404"); } }));
vi.mock("@/lib/marketing-meta", () => ({
  santeFacebook: async () => ({ configure: true, nom: "Page fictive" }),
  depenseFacebookDuMois: async () => ({ cents: null }),
  campagnesFacebook: async () => ({ configure: false, campagnes: [] }),
}));
vi.mock("@/app/admin/marketing/actions", () => {
  const rien = vi.fn(async () => ({}));
  return { deciderPostProgramme: rien, enregistrerReglagesMarketing: rien, programmerCampagne: rien };
});
import PageMarketing from "@/app/admin/marketing/page";

/** Le paragraphe de l'aperçu, sous le titre du post programmé (texte rendu, entités décodées). */
const apercu = (html: string) => /<h3[^>]*>Post programmé fictif<\/h3><p[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1]
  ?.replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

const ID = "22222222-2222-4222-8222-222222222222";
const programme = { id: ID, titre: "Post programmé fictif", chapo: "Chapô fictif", facebook_texte: "Texte fictif préparé", facebook_image_url: null, programmee_pour: "2026-11-26T08:00:00Z", valide_le: null, veille_source_id: null, slug: "post-fictif" };

describe("« Marketing et contenus » : l'aperçu d'un post programmé est le message envoyé à Facebook", () => {
  beforeEach(() => { vi.unstubAllEnvs(); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app"); });

  it("article d'origine « ia » : le lien de l'article puis la mention terminent l'aperçu", async () => {
    banc.programmes = [{ ...programme, origine: "ia" }];
    const texte = apercu(renderToStaticMarkup(await PageMarketing()));
    expect(texte).toBe(`Texte fictif préparé\n\nLire l’article : https://www.gerimmo.app/journal/post-fictif#gerimmo-${ID}\n\n${MENTION_IA_ARTICLE}`);
    // Mot pour mot ce que la mission enverrait (mêmes champs que diffuserPostsEchus).
    expect(texte).toBe(texteFacebook({ id: ID, titre: programme.titre, chapo: programme.chapo, slug: programme.slug, facebookTexte: programme.facebook_texte, facebookImageUrl: null, origine: "ia" }));
  });

  it("article écrit à la main : le lien, sans mention", async () => {
    banc.programmes = [{ ...programme, origine: "manuel" }];
    const texte = apercu(renderToStaticMarkup(await PageMarketing()));
    expect(texte).toBe(`Texte fictif préparé\n\nLire l’article : https://www.gerimmo.app/journal/post-fictif#gerimmo-${ID}`);
    expect(texte).not.toContain(MENTION_IA_ARTICLE);
  });

  it("sans texte préparé : le titre et le chapô, comme le message envoyé, puis le lien et la mention", async () => {
    banc.programmes = [{ ...programme, facebook_texte: null, origine: "ia" }];
    expect(apercu(renderToStaticMarkup(await PageMarketing())))
      .toBe(`Post programmé fictif\n\nChapô fictif\n\nLire l’article : https://www.gerimmo.app/journal/post-fictif#gerimmo-${ID}\n\n${MENTION_IA_ARTICLE}`);
  });

  it("sans adresse d'article : aucun lien inventé, le texte préparé seul", async () => {
    banc.programmes = [{ ...programme, slug: null, origine: "ia" }];
    const texte = apercu(renderToStaticMarkup(await PageMarketing()));
    expect(texte).toBe("Texte fictif préparé");
  });
});
