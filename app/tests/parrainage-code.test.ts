import { describe, expect, it } from "vitest";
import { FORME_CODE, codeDeLaRecherche, lienDeParrainage, normaliserCode } from "../src/lib/parrainage";

describe("la forme d'un code de parrainage", () => {
  it("est huit caractères hexadécimaux en capitales", () => {
    expect(FORME_CODE.test("3FA2B9C0")).toBe(true);
    expect(FORME_CODE.test("3fa2b9c0")).toBe(false);
    expect(FORME_CODE.test("3FA2B9C")).toBe(false);
    expect(FORME_CODE.test("3FA2B9CG")).toBe(false);
  });

  it.each([
    ["3fa2b9c0", "3FA2B9C0"],
    [" 3FA2-B9C0 ", "3FA2B9C0"],
    ["3FA2B9CO", "3FA2B9C0"],
    ["3fa2 b9c0", "3FA2B9C0"],
  ])("pardonne la saisie %s → %s", (saisie, attendu) => {
    expect(normaliserCode(saisie)).toBe(attendu);
  });

  it.each(["", "   ", "3FA2B9C", "3FA2B9C0Z", "bonjour!", null, undefined])(
    "refuse ce qui n'est pas un code : %s",
    (saisie) => {
      expect(normaliserCode(saisie)).toBeNull();
    }
  );
});

describe("le lien de parrainage", () => {
  it("porte le code en paramètre, sans double barre", () => {
    expect(lienDeParrainage("https://gerimmo.fr/", "3FA2B9C0")).toBe("https://gerimmo.fr/inscription?parrain=3FA2B9C0");
    expect(lienDeParrainage("https://gerimmo.fr", "3FA2B9C0")).toBe("https://gerimmo.fr/inscription?parrain=3FA2B9C0");
  });

  it("se relit depuis l'adresse, avec la même tolérance", () => {
    expect(codeDeLaRecherche(new URLSearchParams("parrain=3fa2b9c0"))).toBe("3FA2B9C0");
    expect(codeDeLaRecherche({ parrain: ["3FA2B9C0", "autre"] })).toBe("3FA2B9C0");
    expect(codeDeLaRecherche({ parrain: "n'importe quoi" })).toBeNull();
    expect(codeDeLaRecherche({})).toBeNull();
  });
});
