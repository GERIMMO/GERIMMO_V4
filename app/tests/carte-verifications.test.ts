import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CarteVerifications } from "@/components/carte-verifications";
import { SelecteurPatrimoine } from "@/components/selecteur-patrimoine";

const BASE = "/espace/proprietaire-test";
const contenu = createElement("p", null, "Détail de la demande TEST");
function rendre(patch: Partial<ComponentProps<typeof CarteVerifications>> = {}) {
  const props: ComponentProps<typeof CarteVerifications> = {
    base: BASE, patrimoine: { biens: 2, lots: 5 }, total: 0, critiques: 0,
    apercu: null, indisponible: false, className: "indicateur", children: contenu, ...patch,
  };
  return renderToStaticMarkup(createElement(CarteVerifications, props));
}

describe("carte de l'accueil : patrimoine au repos, vérifications à la demande", () => {
  it("rejoint les tâches courantes déjà visibles sans ouvrir une fenêtre intermédiaire", () => {
    const html = rendre({ total: 2, hrefTaches: "#taches-proprietaire" });
    expect(html).toContain('href="#taches-proprietaire"');
    // Le nom accessible est le libellé visible, dans son ordre (audit du 27/10, TRV-06 : label-content-name-mismatch).
    expect(html).not.toContain("aria-label");
    expect(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).toBe("À vérifier 2 demandes Voir mes tâches");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("aria-haspopup");
    expect(html).not.toContain("Détail de la demande TEST");
  });

  it.each([{ critiques: 1 }, { loyersAConfirmer: 1 }, { indisponible: true }])("conserve la fenêtre pour une priorité, un loyer ou une lecture incomplète : %o", patch => {
    const html = rendre({ total: 1, hrefTaches: "#taches-proprietaire", ...patch });
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('href="#taches-proprietaire"');
  });

  it("conserve l'accès au parc sans afficher de demande ni de fenêtre vide", () => {
    const html = rendre();
    expect(html).toContain(`href="${BASE}/parc"`);
    expect(html).toContain("Patrimoine");
    expect(html).toContain("2 <em>biens</em>");
    expect(html).toContain("5 lots");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Détail de la demande TEST");
  });

  it("annonce les demandes prioritaires et garde leur détail fermé au chargement", () => {
    const html = rendre({ total: 3, critiques: 1, apercu: "Assurance à vérifier" });
    expect(html).toContain('aria-label="Assurance à vérifier — 3 demandes à vérifier, dont 1 prioritaire — ouvrir le détail"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-importante="true"');
    expect(html).toContain('data-loyers="false"');
    expect(html).toContain("1 action prioritaire");
    expect(html).toContain("Assurance à vérifier");
    expect(html).not.toContain(`href="${BASE}/parc"`);
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Détail de la demande TEST");
  });

  it("garde un accès aux détails quand le nombre de demandes n'a pas pu être vérifié", () => {
    const html = rendre({ indisponible: true });
    expect(html).toContain('aria-label="Vérifications indisponibles — ouvrir le détail"');
    expect(html).toContain("Liste incomplète · Voir le détail");
    expect(html).not.toContain(`href="${BASE}/parc"`);
    expect(html).not.toContain("0 demande");
    expect(html).toContain('data-importante="false"');
  });

  it("ne transforme pas un patrimoine indisponible en zéro bien", () => {
    const html = rendre({ patrimoine: null });
    expect(html).toContain("Patrimoine indisponible");
    expect(html).not.toContain("0 bien");
    expect(html).toContain(`href="${BASE}/parc"`);
  });

  it("annonce une lecture incomplète même si des demandes connues restent présentes", () => {
    const html = rendre({ total: 1, indisponible: true, apercu: "Demande connue" });
    expect(html).toContain('aria-label="1 demande à vérifier, liste incomplète — ouvrir le détail"');
    expect(html).toContain("Liste incomplète · Voir le détail");
  });

  it.each([1, 2])("pose directement la question pour %i loyer à confirmer", loyersAConfirmer => {
    const html = rendre({ total: loyersAConfirmer, loyersAConfirmer, apercu: "Réception du loyer à confirmer" });
    const libelle = html.match(/aria-label="([^"]*)"/)?.[1] ?? "";
    expect(libelle).toMatch(/^Avez-vous reçu vos loyers \?/);
    expect(libelle).toContain(`${loyersAConfirmer} loyer${loyersAConfirmer > 1 ? "s" : ""}`);
    expect(libelle).toContain("ouvrir les loyers");
    expect(html.replace(/<[^>]*>/g, " ")).toMatch(/Avez-vous reçu vos loyers \?/);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-importante="true"');
    expect(html).toContain('data-critique="false"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain(`href="${BASE}/parc"`);
  });

  it("compte les loyers distinctement des autres demandes conservées dans le détail", () => {
    const html = rendre({ total: 5, loyersAConfirmer: 2, apercu: "Document à vérifier" });
    const texte = html.replace(/<[^>]*>/g, " ");
    const libelle = html.match(/aria-label="([^"]*)"/)?.[1] ?? "";
    expect(libelle).toMatch(/^Avez-vous reçu vos loyers \?/);
    expect(libelle).toContain("2 loyers");
    expect(texte).toMatch(/2\s+loyers/);
    expect(texte).not.toMatch(/5\s+loyers/);
    expect(libelle).toMatch(/3 autres demandes/);
    expect(html).not.toContain("Détail de la demande TEST");
  });

  it("met une urgence avant la question des loyers sans perdre leurs compteurs", () => {
    const html = rendre({ total: 5, loyersAConfirmer: 2, critiques: 2, apercu: "Intervention urgente" });
    const libelle = html.match(/aria-label="([^"]*)"/)?.[1] ?? "";
    const texte = html.replace(/<[^>]*>/g, " ");
    expect(libelle).toBe("Intervention urgente — 5 demandes à vérifier, dont 2 prioritaires, 2 loyers à confirmer — ouvrir le détail");
    expect(html).toContain('data-importante="true"');
    expect(html).toContain('data-critique="true"');
    expect(html).toContain('data-loyers="true"');
    expect(texte).toContain("2 actions prioritaires");
    expect(texte).toContain("Intervention urgente");
    expect(texte).toContain("5 demandes · 2 loyers à confirmer");
    expect(texte).not.toContain("Avez-vous reçu vos loyers ?");
  });

  it.each([null, "   "])("présente un titre explicite pour une urgence sans aperçu : %j", apercu => {
    const html = rendre({ total: 1, critiques: 1, apercu });
    expect(html).toContain('aria-label="Une action importante vous attend — 1 demande à vérifier, dont 1 prioritaire — ouvrir le détail"');
    expect(html).toContain('data-importante="true"');
    expect(html).toContain("Voir l’action attendue");
    expect(html).not.toContain("0 loyer");
  });

  it("conserve le caractère prioritaire et l'incomplétude de la lecture ensemble", () => {
    const html = rendre({ total: 2, critiques: 1, apercu: "Incident à traiter", indisponible: true });
    expect(html).toContain('aria-label="Incident à traiter — 2 demandes à vérifier, dont 1 prioritaire, liste incomplète — ouvrir le détail"');
    expect(html).toContain('data-importante="true"');
    expect(html).toContain("2 demandes · Liste incomplète");
  });

  it("annonce l'incomplétude quand des loyers connus restent à confirmer", () => {
    const html = rendre({ total: 2, loyersAConfirmer: 1, indisponible: true });
    const libelle = html.match(/aria-label="([^"]*)"/)?.[1] ?? "";
    expect(libelle).toMatch(/^Avez-vous reçu vos loyers \?/);
    expect(libelle).toContain("1 loyer");
    expect(libelle).toContain("liste incomplète");
    expect(html).toContain("Liste incomplète");
    expect(html).not.toContain(`href="${BASE}/parc"`);
  });

  it("revient au patrimoine quand il ne reste ni loyer ni autre demande", () => {
    const avant = rendre({ total: 1, loyersAConfirmer: 1 });
    expect(avant).toContain("Avez-vous reçu vos loyers ?");
    const apres = rendre({ total: 0, loyersAConfirmer: 0 });
    expect(apres).toContain(`href="${BASE}/parc"`);
    expect(apres).not.toContain("Avez-vous reçu vos loyers ?");
    expect(apres).not.toContain("<button");
  });

  it("garde les autres vérifications une fois les loyers reçus", () => {
    const html = rendre({ total: 1, loyersAConfirmer: 0, apercu: "Assurance à vérifier" });
    expect(html).toContain('aria-label="1 demande à vérifier — ouvrir le détail"');
    expect(html).toContain("Assurance à vérifier");
    expect(html).not.toContain("Avez-vous reçu vos loyers ?");
    expect(html).not.toContain(`href="${BASE}/parc"`);
    expect(html).toContain('data-importante="false"');
    expect(html).toContain('data-critique="false"');
  });

  it("retire le signal important lorsque seules des demandes ordinaires restent ouvertes", () => {
    const prioritaire = rendre({ total: 2, critiques: 1, apercu: "Incident urgent" });
    expect(prioritaire).toContain('data-importante="true"');
    const ordinaire = rendre({ total: 1, critiques: 0, apercu: "Document à vérifier" });
    expect(ordinaire).toContain('data-importante="false"');
    expect(ordinaire).toContain('aria-label="1 demande à vérifier — ouvrir le détail"');
    expect(ordinaire).not.toContain("Incident urgent");
    expect(ordinaire).not.toContain(`href="${BASE}/parc"`);
  });
});

describe("contexte du patrimoine", () => {
  it("retire la ligne pour un seul patrimoine, même s'il est listé deux fois", () => {
    expect(renderToStaticMarkup(createElement(SelecteurPatrimoine, {
      orgId: "parc-1", nom: "Parc de Claire", organisations: [{ id: "parc-1", nom: "Parc de Claire" }],
    }))).toBe("");
  });

  it("préserve le changement de patrimoine pour plusieurs SCI", () => {
    const html = renderToStaticMarkup(createElement(SelecteurPatrimoine, {
      orgId: "sci-1", nom: "SCI 1", organisations: [{ id: "sci-1", nom: "SCI 1" }, { id: "sci-2", nom: "SCI 2" }],
    }));
    expect(html).toContain('aria-label="Changer de patrimoine"');
    expect(html).toMatch(/<a(?=[^>]*href="\/espace\/sci-1")(?=[^>]*aria-current="true")[^>]*>/);
    expect(html).toContain('href="/espace/sci-2"');
    expect(html.match(/href="\/espace\/sci-1"/g)).toHaveLength(1);
  });

  it("garde le lien de reprise lorsque les autres patrimoines sont indisponibles", () => {
    const html = renderToStaticMarkup(createElement(SelecteurPatrimoine, {
      orgId: "sci-1", nom: "SCI 1", organisations: [], indisponible: true,
    }));
    expect(html).toContain("Autres patrimoines indisponibles · Réessayer");
    expect(html).toContain('href="/espaces"');
  });
});

describe("carte rouge : une pulsation brève, jamais sans fin (audit du 27/10, TRV-10)", () => {
  const css = readFileSync("src/components/carte-verifications.module.css", "utf8");
  it("s'arrête avant cinq secondes (WCAG 2.2.2) et ne joue qu'en l'absence de « réduire les animations »", () => {
    const declarations = [...css.matchAll(/animation:\s*respirationAlerte\s+([\d.]+)s\s+[\w-]+\s+([^;]+);/g)];
    expect(declarations).toHaveLength(1);
    const [, duree, repetitions] = declarations[0];
    expect(repetitions.trim()).toMatch(/^\d+$/);
    expect(Number(duree) * Number(repetitions)).toBeLessThanOrEqual(5);
    expect(css).not.toMatch(/infinite/);
    const debut = css.indexOf("@media screen and (prefers-reduced-motion: no-preference)");
    const fin = css.indexOf("@media", debut + 1);
    const position = css.indexOf("animation: respirationAlerte");
    expect(debut).toBeGreaterThanOrEqual(0);
    expect(position > debut && position < fin).toBe(true);
  });
});
