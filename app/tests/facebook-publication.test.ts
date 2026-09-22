import { beforeEach, describe, expect, it, vi } from "vitest";
import { messageMetaLisible, texteFacebook } from "@/lib/facebook";

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

  it("traduit les erreurs techniques Meta en action compréhensible", () => {
    expect(messageMetaLisible(new Error("(#200) Ad account owner has NOT grant ads_management or ads_read permission")))
      .toBe("Le compte est relié, mais les autorisations Meta Ads restent à accorder à Gerimmo dans Meta Business.");
    expect(messageMetaLisible(new Error("Invalid OAuth access token")))
      .toContain("Renouvelez la connexion");
  });
});
