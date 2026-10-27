import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/signature-bail", () => ({
  actualiserSignatureBail: vi.fn(), annulerSignatureBail: vi.fn(), envoyerSignatureBail: vi.fn(), lireSignatureBail: vi.fn(), preparerSignatureBail: vi.fn(), activerBailApresSignature: vi.fn(),
}));
import { ManquantsSignature } from "@/components/signature-electronique-bail";

const tous = ["Surface habitable", "Adresse du logement", "Téléphone du locataire", "Annexe à vérifier"];
const rendre = (dejaAffiches?: string[]) => renderToStaticMarkup(createElement(ManquantsSignature, {
  manquants: tous, manquantsDejaAffiches: dejaAffiches,
  corriger: (champ: string) => champ.startsWith("Téléphone") ? "#etape-bail-2" : "#etape-bail-5",
}));

describe("manquants du circuit de signature : présentation sans doublon", () => {
  it("conserve toute la liste par défaut sur les autres écrans", () => {
    const html = rendre(); for (const champ of tous) expect(html).toContain(champ);
    expect(html).not.toContain('href="#bilan-bail"');
  });
  it("garde les demandes propres à la signature et leurs actions", () => {
    const html = rendre(["Surface habitable", "Adresse du logement"]);
    expect(html).not.toContain("Surface habitable"); expect(html).not.toContain("Adresse du logement");
    expect(html).toContain("Téléphone du locataire"); expect(html).toContain("Annexe à vérifier");
    expect(html).toContain('href="#etape-bail-2"'); expect(html).toContain('href="#etape-bail-5"');
  });
  it("garde un retour au bilan lorsque tous les blocages y sont déjà présentés", () => {
    const html = rendre(tous);
    expect(html).toContain('href="#bilan-bail"'); expect(html).toContain("avant de préparer les signatures");
    expect(html).not.toContain("<ul"); expect(html).not.toContain("Téléphone du locataire");
  });
  it("ne transforme pas une liste sans manque en avertissement", () => {
    expect(renderToStaticMarkup(createElement(ManquantsSignature, { manquants: [], manquantsDejaAffiches: tous }))).toBe("");
  });
});
