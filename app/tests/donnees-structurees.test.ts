/**
 * Données structurées des pages publiques (20/11/2026) : ce que lisent les moteurs de recherche.
 *
 * Ce que ces tests tiennent :
 *  1. chaque bloc est du schema.org valide dans sa forme, avec des adresses ABSOLUES (Google ignore les relatives) ;
 *  2. rien n'est déclaré qui ne soit à l'écran : ni offre commerciale ni note (ventes fermées, aucun avis recueilli) ;
 *  3. le JSON est inerte dans le HTML : un « </script> » venu d'un titre ne ferme pas la balise, et le moteur relit
 *     exactement le même objet ;
 *  4. les blocs sont posés là où on les attend (accueil, chaque outil, chaque article), et la page des tarifs est
 *     inchangée.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  adresseAbsolue,
  articleJournal,
  filAriane,
  organisation,
  questionsFrequentes,
  serialiserDonnees,
  siteWeb,
} from "../src/lib/donnees-structurees";
import { DonneesStructurees } from "../src/components/donnees-structurees";

const SITE = "https://gerimmo.app";

describe("les blocs schema.org", () => {
  it("une adresse est toujours absolue, que le site finisse ou non par une barre oblique", () => {
    expect(adresseAbsolue(SITE, "/outils")).toBe("https://gerimmo.app/outils");
    expect(adresseAbsolue(`${SITE}/`, "/")).toBe("https://gerimmo.app/");
    expect(adresseAbsolue(SITE, "https://cdn.exemple.test/image.png")).toBe("https://cdn.exemple.test/image.png");
  });

  it("l'éditeur et le site : nom, adresse, logo absolu, langue", () => {
    expect(organisation(SITE, "/logo/gerimmo-officiel.png")).toEqual({
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": "https://gerimmo.app/#organisation",
      name: "Gerimmo",
      url: "https://gerimmo.app/",
      logo: "https://gerimmo.app/logo/gerimmo-officiel.png",
    });
    const site = siteWeb(SITE, "Description");
    expect(site).toMatchObject({ "@type": "WebSite", name: "Gerimmo", url: "https://gerimmo.app/", inLanguage: "fr-FR" });
    expect(site.publisher).toEqual({ "@id": "https://gerimmo.app/#organisation" });
    expect(site).not.toHaveProperty("potentialAction");
  });

  it("le fil d'Ariane numérote ses étapes à partir de 1, chacune avec son adresse absolue", () => {
    expect(filAriane(SITE, [{ nom: "Accueil", chemin: "/" }, { nom: "Outils gratuits", chemin: "/outils" }, { nom: "Calcul IRL", chemin: "/outils/calcul-irl" }])).toEqual({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Accueil", item: "https://gerimmo.app/" },
        { "@type": "ListItem", position: 2, name: "Outils gratuits", item: "https://gerimmo.app/outils" },
        { "@type": "ListItem", position: 3, name: "Calcul IRL", item: "https://gerimmo.app/outils/calcul-irl" },
      ],
    });
  });

  it("les questions fréquentes reprennent mot pour mot les questions et réponses données", () => {
    expect(questionsFrequentes([["Une question ?", "Une réponse."]])).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "Une question ?", acceptedAnswer: { "@type": "Answer", text: "Une réponse." } }],
    });
  });

  it("un article : titre, image et adresse absolues, dates, auteur et éditeur Gerimmo", () => {
    const a = articleJournal(SITE, {
      chemin: "/journal/revision-du-loyer",
      titre: "La révision du loyer",
      description: "Ce qu'il faut savoir.",
      image: "https://stockage.exemple.test/illustration.png",
      logo: "/logo/gerimmo-officiel.png",
      publieLe: "2026-11-02T08:00:00+00:00",
      modifieLe: "2026-11-03T08:00:00+00:00",
    });
    expect(a).toMatchObject({
      "@type": "BlogPosting",
      headline: "La révision du loyer",
      description: "Ce qu'il faut savoir.",
      url: "https://gerimmo.app/journal/revision-du-loyer",
      mainEntityOfPage: { "@type": "WebPage", "@id": "https://gerimmo.app/journal/revision-du-loyer" },
      image: ["https://stockage.exemple.test/illustration.png"],
      datePublished: "2026-11-02T08:00:00+00:00",
      dateModified: "2026-11-03T08:00:00+00:00",
      inLanguage: "fr-FR",
    });
    expect(a.author).toEqual(a.publisher);
    expect(a.publisher).toMatchObject({ "@type": "Organization", name: "Gerimmo", logo: { url: "https://gerimmo.app/logo/gerimmo-officiel.png" } });
  });

  it("un article sans date de modification reprend la date de parution ; sans aucune date, il n'en invente pas", () => {
    const base = { chemin: "/journal/x", titre: "X", image: "/logo/gerimmo-officiel.png", logo: "/logo/gerimmo-officiel.png" };
    expect(articleJournal(SITE, { ...base, publieLe: "2026-11-02", modifieLe: null })).toMatchObject({ datePublished: "2026-11-02", dateModified: "2026-11-02" });
    const sansDate = articleJournal(SITE, { ...base, publieLe: null, modifieLe: null });
    expect(sansDate).not.toHaveProperty("datePublished");
    expect(sansDate).not.toHaveProperty("dateModified");
    expect(sansDate).not.toHaveProperty("description");
  });

  it("aucun bloc ne déclare d'offre commerciale ni de note", () => {
    const tout = JSON.stringify([
      organisation(SITE, "/l.png"),
      siteWeb(SITE, "d"),
      filAriane(SITE, [{ nom: "Accueil", chemin: "/" }]),
      questionsFrequentes([["q", "r"]]),
      articleJournal(SITE, { chemin: "/journal/x", titre: "x", image: "/l.png", logo: "/l.png", publieLe: null, modifieLe: null }),
    ]);
    expect(tout).not.toMatch(/Offer|offers|aggregateRating|Review|price/i);
  });
});

describe("le bloc dans le HTML", () => {
  const piege = { "@context": "https://schema.org", "@type": "BlogPosting", headline: "Fin </script><script>alert(1)</script> & co\u2028" };

  it("est inerte : ni balise fermante, ni chevron, ni esperluette, ni séparateur de ligne en clair", () => {
    const texte = serialiserDonnees(piege);
    expect(texte).not.toMatch(/[<>&\u2028\u2029]/);
    expect(texte).toContain("\\u003c/script\\u003e");
  });

  it("se relit exactement à l'identique", () => {
    expect(JSON.parse(serialiserDonnees(piege))).toEqual(piege);
    expect(JSON.parse(serialiserDonnees([piege, piege]))).toEqual([piege, piege]);
  });

  it("est rendu comme un seul bloc de données JSON-LD, jamais comme un script exécutable", () => {
    const html = renderToStaticMarkup(createElement(DonneesStructurees, { donnees: piege }));
    const bloc = /^<script type="application\/ld\+json">([\s\S]*)<\/script>$/.exec(html);
    expect(bloc).not.toBeNull();
    expect(JSON.parse(bloc![1])).toEqual(piege);
    expect(html.match(/<script/g)).toHaveLength(1);
  });
});

describe("où les blocs sont posés", () => {
  const lire = (chemin: string) => readFileSync(chemin, "utf8");

  it("l'accueil : l'éditeur, le site et les questions fréquentes, tirées de la même liste que celles affichées", () => {
    const accueil = lire("src/app/page.tsx");
    expect(accueil).toContain("organisation(site, CHARTE_GERIMMO.logo)");
    expect(accueil).toContain("questionsFrequentes(faq(duree))");
    expect(accueil).toContain("{faq(duree).map(");
  });

  it("chaque outil gratuit : son fil d'Ariane, depuis la coquille commune", () => {
    const coquille = lire("src/components/outils/coquille-outil.tsx");
    expect(coquille).toContain("<DonneesStructurees");
    expect(coquille).toMatch(/filAriane\(adresseCanonique\(\), \[\s*\{ nom: "Accueil", chemin: "\/" \},\s*\{ nom: "Outils gratuits", chemin: "\/outils" \},\s*\{ nom: titre, chemin \},/);
  });

  it("chaque article : l'article et son fil d'Ariane ; jamais l'illustration SVG de repli", () => {
    const article = lire("src/app/journal/[slug]/page.tsx");
    expect(article).toContain("articleJournal(site, {");
    expect(article).toContain("illustration.repli ? CHARTE_GERIMMO.logo : illustration.src");
    expect(article).toMatch(/\{ nom: "Le journal", chemin: "\/journal" \}/);
  });

  it("la page des tarifs est inchangée", () => {
    expect(lire("src/app/tarifs/page.tsx")).not.toContain("DonneesStructurees");
  });
});
