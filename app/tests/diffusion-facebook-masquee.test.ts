/**
 * Décision du dirigeant du 25/11/2026 (suite des défauts d'écran E198 et E101) : tant que la Page Facebook n'est pas
 * « Relié » dans « Vos canaux de diffusion » — « À vérifier » (reliée mais illisible) ou « À relier » —, la diffusion
 * sur Facebook est MASQUÉE, pas seulement grisée, partout où elle est proposée :
 *  — éditeur d'article : le texte de la publication Facebook et « Publier sur Facebook » ;
 *  — « Marketing et contenus » : la colonne « À diffuser », « Publier maintenant » et « Valider pour l'heure prévue »
 *    des posts programmés, la case « Publier automatiquement » (jusqu'ici grisée).
 * Un court texte dit pourquoi et où vérifier la Page (« Vos canaux de diffusion »). Rien n'est perdu : le texte préparé
 * pour Facebook repart tel quel à l'enregistrement de l'article, et l'illustration (aussi celle du journal) reste
 * modifiable. Rendu sans base (données fictives), avec les vrais composants de l'écran.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Filtres = { table: string; eq: Record<string, unknown> };
const banc = vi.hoisted(() => ({
  facebook: { configure: false } as { configure: boolean; erreur?: string; nom?: string },
  donnees: (_f: { table: string; eq: Record<string, unknown> }) => ({ data: [] as unknown, error: null as unknown, count: 0 as number | null }),
}));
function requete(table: string) {
  const f: Filtres = { table, eq: {} };
  const q: Record<string, unknown> = {};
  for (const m of ["select", "contains", "neq", "is", "in", "or", "not", "lt", "like", "gte", "order", "limit", "range"]) q[m] = () => q;
  q.eq = (cle: string, valeur: unknown) => { f.eq[cle] = valeur; return q; };
  q.single = () => Promise.resolve(banc.donnees({ ...f, eq: { ...f.eq, un: true } }));
  q.maybeSingle = q.single;
  q.then = (ok: (r: unknown) => unknown) => Promise.resolve(banc.donnees(f)).then(ok);
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
  santeFacebook: async () => banc.facebook,
  depenseFacebookDuMois: async () => ({ cents: null }),
  campagnesFacebook: async () => ({ configure: false, campagnes: [] }),
}));
vi.mock("@/app/actions/publications", () => {
  const rien = vi.fn(async () => ({}));
  return { enregistrerPublication: rien, publierPublication: rien, refuserPublication: rien, retirerPublication: rien, publierPublicationFacebook: rien, resoudreDiffusionFacebook: rien };
});
vi.mock("@/app/admin/marketing/actions", () => {
  const rien = vi.fn(async () => ({}));
  return { deciderPostProgramme: rien, enregistrerReglagesMarketing: rien, programmerCampagne: rien };
});

import { EditeurPublication } from "@/app/admin/publications/[id]/editeur-publication";
import PageMarketing from "@/app/admin/marketing/page";

const texte = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
/** La balise <input> d'un champ nommé, quel que soit l'ordre de ses attributs. */
const balise = (html: string, nom: string) => new RegExp(`<input[^>]*name="${nom}"[^>]*>`).exec(html)?.[0];
const LIEN_CANAUX = /<a [^>]*href="\/admin\/marketing#canaux"[^>]*>Vos canaux de diffusion<\/a>/;
const POURQUOI = {
  a_verifier: "La connexion à la Page Facebook est à vérifier : Gerimmo n’arrive pas à lire la Page, la diffusion sur Facebook n’est donc pas proposée.",
  a_relier: "La Page Facebook n’est pas encore reliée à Gerimmo : la diffusion sur Facebook n’est pas proposée.",
};

describe("éditeur d'article", () => {
  const article = {
    id: "article-fictif", titre: "Titre fictif", slug: "titre-fictif", chapo: "Chapô fictif", corps: "Corps fictif.",
    seoDescription: null, statut: "brouillon", sources: [], facebookTexte: "Texte préparé pour Facebook", facebookImageUrl: "https://exemple.test/visuel.png",
    tentativeFacebook: null, facebookPostId: null, facebookPublieLe: null, facebookErreur: null,
  };
  const editeur = (facebook: "relie" | "a_verifier" | "a_relier", statut = "brouillon") =>
    renderToStaticMarkup(createElement(EditeurPublication, { ...article, statut, facebook }));

  it.each(["a_verifier", "a_relier"] as const)("Page %s : ni texte de publication Facebook ni « Publier sur Facebook », et la raison", (etat) => {
    for (const statut of ["brouillon", "publiee"]) {
      const html = editeur(etat, statut);
      const t = texte(html);
      expect(html, statut).not.toContain('id="facebook_texte"');
      expect(t, statut).not.toContain("Texte de la publication");
      expect(t, statut).not.toContain("Publier sur Facebook");
      expect(t, statut).toContain(POURQUOI[etat]);
      expect(html, statut).toMatch(LIEN_CANAUX);
      // Rien n'est perdu à l'enregistrement : le texte préparé repart tel quel, l'illustration reste modifiable.
      const texteGarde = balise(html, "facebook_texte");
      expect(texteGarde, statut).toContain('type="hidden"');
      expect(texteGarde, statut).toContain('value="Texte préparé pour Facebook"');
      const image = balise(html, "facebook_image_url");
      expect(image, statut).toContain('id="facebook_image_url"');
      expect(image, statut).toContain('value="https://exemple.test/visuel.png"');
      expect(image, statut).not.toContain('type="hidden"');
    }
  });

  it("Page reliée et lue : la diffusion reste proposée, sans texte de masquage", () => {
    const html = editeur("relie", "publiee");
    const t = texte(html);
    expect(html).toContain('id="facebook_texte"');
    expect(t).toContain("Publier sur Facebook");
    expect(t).not.toContain("n’est pas proposée");
    expect(balise(html, "facebook_texte")).toBeUndefined();
  });
});

describe("« Marketing et contenus »", () => {
  const programme = { id: "22222222-2222-4222-8222-222222222222", titre: "Post programmé fictif", chapo: "Chapô", facebook_texte: "Texte fictif", facebook_image_url: null, programmee_pour: "2026-11-26T08:00:00Z", valide_le: null, veille_source_id: null, slug: "post-fictif" };
  const publications = [
    { id: "p-paru", titre: "Article paru fictif", statut: "publiee", slug: "paru", propose_le: "2026-11-20T08:00:00Z", publie_le: "2026-11-20T08:00:00Z", facebook_post_id: null, facebook_publie_le: null, facebook_erreur: null, facebook_image_url: null },
    { id: "p-brouillon", titre: "Brouillon fictif", statut: "brouillon", slug: null, propose_le: "2026-11-21T08:00:00Z", publie_le: null, facebook_post_id: null, facebook_publie_le: null, facebook_erreur: null, facebook_image_url: null },
  ];
  beforeEach(() => {
    banc.donnees = (f) => {
      if (f.table === "marketing_reglages") {
        return { data: { phase_editoriale: undefined, actif: true, publication_automatique: true, publicite_active: false, jours_semaine: [2, 5], heure_paris: 9, heure_preparation_paris: 18, budget_mensuel_cents: 0, validation_obligatoire: true, veille_mots_inclus: ["loyer"], veille_mots_exclus: [] }, error: null, count: null };
      }
      if (f.table === "publications" && f.eq.statut === "programmee") return { data: [programme], error: null, count: 1 };
      if (f.table === "publications") return { data: publications, error: null, count: 2 };
      return { data: [], error: null, count: 0 };
    };
  });
  const rendre = async () => renderToStaticMarkup(await PageMarketing());
  const bouton = (nom: string) => new RegExp(`<button[^>]*>${nom}</button>`);

  it.each([
    ["a_verifier", { configure: true, erreur: "Meta ne répond pas." }],
    ["a_relier", { configure: false }],
  ] as const)("Page %s : colonne « À diffuser », « Publier maintenant », « Valider » et « Publier automatiquement » masqués", async (etat, facebook) => {
    banc.facebook = facebook;
    const html = await rendre();
    const t = texte(html);
    expect(t).not.toContain("À diffuser");
    expect(t).not.toContain("diffusion Facebook à examiner");
    expect(html).not.toMatch(bouton("Publier maintenant"));
    expect(html).not.toMatch(bouton("Valider pour l’heure prévue"));
    expect(html).not.toContain('name="publication_automatique"');
    expect(t).not.toContain("Publier automatiquement");
    // Les gestes qui empêchent ou préparent une diffusion restent : relire, reporter, refuser.
    expect(t).toContain("Post programmé fictif");
    for (const geste of ["Reporter", "Refuser"]) expect(html).toMatch(bouton(geste));
    expect(html).toContain('href="/admin/publications/22222222-2222-4222-8222-222222222222"');
    // Les articles restent visibles, sans annoncer de texte Facebook à relire.
    expect(t).toContain("Brouillon fictif");
    expect(t).toContain("Article à relire");
    expect(t).not.toContain("texte Facebook à relire");
    // Pourquoi, et où vérifier la Page : dans l'atelier, sous le post programmé et dans les réglages.
    expect(t.split(POURQUOI[etat]).length - 1).toBeGreaterThanOrEqual(3);
    expect(html).toMatch(LIEN_CANAUX);
    expect(t).toContain(etat === "a_verifier" ? "À vérifier" : "À relier");
  });

  it("Page reliée et lue : la diffusion reste proposée partout", async () => {
    banc.facebook = { configure: true, nom: "Page fictive" };
    const html = await rendre();
    const t = texte(html);
    expect(t).toContain("À diffuser");
    expect(t).toContain("diffusion Facebook à examiner");
    expect(html).toMatch(bouton("Publier maintenant"));
    expect(html).toMatch(bouton("Valider pour l’heure prévue"));
    const caseAuto = /<input[^>]*name="publication_automatique"[^>]*>/.exec(html)?.[0];
    expect(caseAuto).toContain('type="checkbox"');
    expect(caseAuto).not.toContain("disabled");
    expect(t).toContain("Article et texte Facebook à relire");
    expect(t).not.toContain("n’est pas proposée");
  });
});
