import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GrillesTarifaires } from "@/components/grilles-tarifaires";
import PageConditions from "@/app/conditions/page";

const texte = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("la présentation commerciale de la nouvelle grille", () => {
  it("affiche le vrai prélèvement annuel des quatre offres, sans le remplacer par un équivalent mensuel", () => {
    const html = renderToStaticMarkup(createElement(GrillesTarifaires));
    const articles = [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)].map((m) => texte(m[1]));
    expect(articles).toHaveLength(4);
    for (const [i, attendu] of [["Solo", "5,99", "59,90"], ["Bailleur", "9,99", "99,90"], ["Investisseur", "19,99", "199,90"], ["Patrimoine", "29,99", "299,90"]].entries()) {
      expect(articles[i]).toContain(attendu[0]);
      expect(articles[i]).toContain(`${attendu[1]} € TTC / mois`);
      expect(articles[i]).toContain(`${attendu[2]} € TTC / an`);
      expect(articles[i]).toContain("Prélevés en une fois pour 12 mois");
    }
  });

  it("publie les exemples de facturation de référence et leur nature fiscale", () => {
    const html = texte(renderToStaticMarkup(createElement(GrillesTarifaires)));
    for (const exemple of ["10 lots : 39,00 € HT/mois", "20 lots : 59,00 € HT/mois", "50 lots : 119,00 € HT/mois", "100 lots : 194,00 € HT/mois", "200 lots : 344,00 € HT/mois", "300 lots : 444,00 € HT/mois", "500 lots : 644,00 € HT/mois", "34,99 € TTC / mois", "349,90 € TTC prélevés par an"]) expect(html).toContain(exemple);
    expect(html).toContain("régime fiscal vérifié de Gerimmo");
    expect(html).not.toMatch(/TVA.{0,12}20\s*%/i);
  });

  it("ne transforme pas une simulation en souscription et annonce les prestations séparées", () => {
    const html = texte(renderToStaticMarkup(createElement(GrillesTarifaires)));
    expect(html).toContain("Cette estimation ne souscrit aucune offre");
    expect(html).toContain("Cette estimation");
    expect(html).toContain("travaux restent sur devis, facturés séparément");
    expect(html).toContain("sans suppression automatique");
    expect(html).not.toMatch(/(?:premier|1ᵉʳ) bien (?:est )?(?:offert|gratuit)/i);
  });

  it("conserve les droits payés et les données dans les conditions, en distinguant les anciens avantages", () => {
    const html = texte(renderToStaticMarkup(createElement(PageConditions)));
    expect(html).toContain("droits déjà payés jusqu’à la fin de la période");
    expect(html).toContain("jours restants sont conservés");
    expect(html).toContain("aucun débit rétroactif");
    expect(html).toContain("données restent consultables, téléchargeables et exportables en lecture seule");
    expect(html).not.toContain("puis supprimées ou anonymisées");
  });
});
