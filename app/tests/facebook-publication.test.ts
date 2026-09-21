import { beforeEach, describe, expect, it, vi } from "vitest";
import { texteFacebook } from "@/lib/facebook";

describe("publication Facebook Gerimmo", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.gerimmo.app"));

  it("publie avec la voix de Gerimmo et le lien canonique", () => {
    const texte = texteFacebook({
      titre: "La gestion locative, tenue au carré",
      chapo: "Baux, loyers, documents et incidents réunis.",
      slug: "bienvenue-gerimmo",
      facebookTexte: "Gerimmo simplifie le quotidien des professionnels de la gestion locative.",
      facebookImageUrl: null,
    });
    expect(texte).toContain("Gerimmo simplifie");
    expect(texte).toContain("https://www.gerimmo.app/journal/bienvenue-gerimmo");
    expect(texte).not.toMatch(/OpenAI|assistant|je publie/i);
  });
});
