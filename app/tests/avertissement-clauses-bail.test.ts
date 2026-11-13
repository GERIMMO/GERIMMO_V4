import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AvertissementClauses } from "@/app/agence/[orgId]/baux/[bailId]/avertissement-clauses";

describe("Saisie des clauses particulières", () => {
  it("rattache le conseil au champ et donne accès à la source légale", () => {
    const html = renderToStaticMarkup(createElement(AvertissementClauses, { id: "clauses-aide" }));
    expect(html).toContain('id="clauses-aide"');
    expect(html).toContain("frais de relance");
    expect(html).toContain("quittances restent à la charge du bailleur");
    expect(html).toContain("prélèvement automatique");
    expect(html).toContain("pénalité");
    expect(html).toContain("legifrance.gouv.fr/codes/article_lc/LEGIARTI000047900082");
  });
});
