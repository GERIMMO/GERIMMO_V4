/**
 * Reprise du lot L4 (26/11/2026), éditeur d'article (/admin/publications/<id>) sous `lg` : la colonne de contrôle passe
 * avant le formulaire (order-first) et la barre « Enregistrer » est collée en bas de l'écran (sticky bottom). Un élément
 * collant reste dans son bloc parent, mais peut remonter jusqu'en haut de celui-ci : quand le haut du formulaire arrivait
 * en bas de l'écran, la barre couvrait « Titre » (mesuré dans Chromium à 390 x 844 avec la feuille compilée : jusqu'à
 * 52 px, le champ entier, à l'ouverture ou en défilant ; « Chapô » jusqu'à 111 px).
 *
 * La barre vit désormais dans un sous-bloc du formulaire qui commence APRÈS « Titre » et « Chapô » : elle ne peut plus
 * remonter au-dessus d'eux. Le sous-bloc commence par le corps de l'article : pendant sa saisie, la barre reste collée
 * en bas de l'écran (audit C18). Ce test vérifie l'ordre et l'emboîtement des éléments rendus ; la mesure dans le
 * navigateur n'est pas rejouée ici (pas de navigateur dans la suite unitaire).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }), notFound: () => { throw Error("404"); } }));
vi.mock("@/app/actions/publications", () => {
  const rien = vi.fn(async () => ({}));
  return { enregistrerPublication: rien, publierPublication: rien, refuserPublication: rien, retirerPublication: rien, publierPublicationFacebook: rien, resoudreDiffusionFacebook: rien };
});
import { EditeurPublication } from "@/app/admin/publications/[id]/editeur-publication";

const article = {
  id: "article-fictif", titre: "Titre fictif", slug: "titre-fictif", chapo: "Chapô fictif", corps: "Corps fictif.",
  seoDescription: null, sources: [], facebookTexte: "Texte fictif", facebookImageUrl: null,
  tentativeFacebook: null, facebookPostId: null, facebookPublieLe: null, facebookErreur: null,
};

/** La fin (indice de la balise fermante) du <div> ouvert à `debut`. */
function finDuDiv(html: string, debut: number): number {
  const balise = /<(\/?)div\b[^>]*>/g;
  balise.lastIndex = debut;
  let profondeur = 0;
  for (let m = balise.exec(html); m; m = balise.exec(html)) {
    profondeur += m[1] ? -1 : 1;
    if (profondeur === 0) return m.index;
  }
  return -1;
}
/** Profondeur de <div> entre `debut` (exclu) et `position` : 0 = enfant direct du <div> ouvert à `debut`. */
function profondeurDans(html: string, debut: number, position: number): number {
  const balise = /<(\/?)div\b[^>]*>/g;
  balise.lastIndex = debut + 1;
  let profondeur = 0;
  for (let m = balise.exec(html); m && m.index < position; m = balise.exec(html)) profondeur += m[1] ? -1 : 1;
  return profondeur;
}

describe("éditeur d'article sous `lg` : la barre « Enregistrer » ne peut pas passer au-dessus de « Titre » ni de « Chapô »", () => {
  it.each([
    ["brouillon", "relie"], ["brouillon", "a_relier"], ["publiee", "relie"], ["publiee", "a_verifier"],
  ] as const)("article %s, Page Facebook %s", (statut, facebook) => {
    const html = renderToStaticMarkup(createElement(EditeurPublication, { ...article, statut, facebook }));
    const formulaire = html.search(/<form\b[^>]*\bid="formulaire-article"/);
    const bloc = html.lastIndexOf("<div", html.indexOf("data-bloc-barre-collante"));
    const finBloc = finDuDiv(html, bloc);
    const barre = html.lastIndexOf("<div", html.indexOf("data-barre-collante="));
    expect(formulaire).toBeGreaterThanOrEqual(0);
    expect(html.indexOf("data-bloc-barre-collante")).toBeGreaterThan(formulaire);
    expect(finBloc).toBeGreaterThan(bloc);
    expect(html.indexOf("</form>", formulaire)).toBeGreaterThan(finBloc);

    // « Titre » et « Chapô » (libellé et champ) sont dans le formulaire, AVANT le sous-bloc.
    for (const champ of ['id="titre"', 'for="titre"', 'id="chapo"', 'for="chapo"']) {
      expect(html.indexOf(champ), champ).toBeGreaterThan(formulaire);
      expect(html.indexOf(champ), champ).toBeLessThan(bloc);
    }
    expect(html.indexOf("</textarea>", html.indexOf('id="chapo"'))).toBeLessThan(bloc);

    // La barre collante est un enfant DIRECT du sous-bloc : c'est lui, et non le formulaire, qui borne son déplacement.
    expect(barre).toBeGreaterThan(bloc);
    expect(barre).toBeLessThan(finBloc);
    expect(profondeurDans(html, bloc, barre)).toBe(0);
    expect(html.slice(barre, html.indexOf(">", barre))).toMatch(/\bsticky bottom-\[calc\(72px/);
    expect(html.slice(barre, html.indexOf(">", barre))).toContain("lg:hidden");

    // Le corps, l'adresse et la suite sont dans le sous-bloc, avant la barre : elle reste collée pendant leur saisie.
    for (const champ of ['id="corps"', 'id="slug"', 'id="seo_description"', 'id="facebook_image_url"']) {
      expect(html.indexOf(champ), champ).toBeGreaterThan(bloc);
      expect(html.indexOf(champ), champ).toBeLessThan(barre);
    }
  });
});
