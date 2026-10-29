import { describe, expect, it } from "vitest";
import { lireAnneeExercice } from "../src/lib/annee-exercice";
describe("année d’exercice saisie", () => {
  it.each([null, "", " ", "2e3", "0x7ea", "Infinity", "2026.5", "2026.0", "1969", "2201", new File([], "2026")])("refuse une année ambiguë ou hors limites : %s", brut => { expect(lireAnneeExercice(brut)).toBeNull(); });
  it("accepte quatre chiffres avec des espaces périphériques", () => { expect(lireAnneeExercice(" 2026 ")).toBe(2026); });
});
