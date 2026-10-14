import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { neutraliserFormule } from "../src/lib/csv-sur";

// Audit du 13/10 (CHF-04) : l'export du journal de gestion recopiait les libellés saisis, y compris « =1+1 » ou
// « =HYPERLINK(...) », que le tableur du comptable évalue comme une formule.
describe("neutraliserFormule", () => {
  it.each(["=1+1", "=HYPERLINK(\"http://exemple.invalid\";\"cliquez\")", "+33 1 23", "-2+3", "@SOMME(A1)", "\tcmd", "\rcmd"])(
    "préfixe une apostrophe devant %j", valeur => { expect(neutraliserFormule(valeur)).toBe(`'${valeur}`); });
  it.each(["Loyer de septembre", "Travaux = plomberie", "Réf. 12-3", "", "É=mc²", "100 €"])(
    "laisse %j tel quel", valeur => { expect(neutraliserFormule(valeur)).toBe(valeur); });
  it("l'export du journal applique la neutralisation à chaque colonne de texte, jamais au montant", () => {
    const source = readFileSync("src/app/agence/[orgId]/comptabilite/export/route.ts", "utf8");
    expect(source).toContain("neutraliserFormule(String(v ?? \"\")");
    expect(source).toMatch(/montantFr\(e\.montant\)/);
    expect(source).not.toMatch(/neutraliserFormule\(montantFr/);
  });
});
