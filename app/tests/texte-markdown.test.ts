import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TexteMarkdown } from "@/components/texte-markdown";

const rendre = (contenu: string) => renderToStaticMarkup(createElement(TexteMarkdown, { contenu }));

describe("articles du journal", () => {
  it("sépare un titre du paragraphe suivant sans exiger une ligne vide", () => {
    const html = rendre("## Titre\nLe paragraphe.");
    expect(html).toMatch(/<h2[^>]*>Titre<\/h2>/);
    expect(html).toMatch(/<p[^>]*>Le paragraphe\.<\/p>/);
  });

  it("sépare les listes du texte voisin", () => {
    const html = rendre("Introduction\n- Premier\n- Second\nConclusion\n1. Étape un\n2. Étape deux");
    expect(html).toMatch(/<p[^>]*>Introduction<\/p>/);
    expect(html).toMatch(/<ul[^>]*>.*Premier.*Second.*<\/ul>/);
    expect(html).toMatch(/<p[^>]*>Conclusion<\/p>/);
    expect(html).toMatch(/<ol[^>]*>.*Étape un.*Étape deux.*<\/ol>/);
  });

  it("échappe le HTML et refuse les liens exécutables", () => {
    const html = rendre('<script>alert(1)</script>\n[Cliquer](javascript:alert)');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("href=");
  });
});
