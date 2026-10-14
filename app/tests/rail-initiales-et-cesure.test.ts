import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Audit du 14/10 (VUI-02, VUI-03) : deux défauts de CSS que seul le navigateur montre, gardés ici par la source.
const css = readFileSync("src/app/globals.css", "utf8");
describe("rail tablette", () => {
  it("la règle des initiales du rail locataire bat la classe utilitaire text-base du span (VUI-02)", () => {
    expect(css).toMatch(/\.loc-logo \[data-initiales\] \{ font-size: 0 !important; \}/);
    const marque = readFileSync("src/components/marque-organisation.tsx", "utf8");
    expect(marque).toContain("data-initiales");
  });
  it("les libellés du rail de l'agence se coupent par césure, pas au milieu d'un mot (VUI-03)", () => {
    const bloc = css.slice(css.indexOf(".coquille-late .coquille-menu a .lib {"));
    const regle = bloc.slice(0, bloc.indexOf("}"));
    expect(regle).toContain("hyphens: auto");
    expect(regle).toContain("overflow-wrap: break-word");
    expect(regle).not.toContain("overflow-wrap: anywhere");
  });
});
