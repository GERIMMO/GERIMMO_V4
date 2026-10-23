// Audit du 23/10 (A06) : la page tarifs disait la signature électronique « pas
// encore proposée » alors que les circuits Zoho Sign sont ouverts (bail,
// documents, devis le 19/10 ; cautionnement le 21/10). Elle dit ce qui existe,
// sans promettre ni volume ni gratuité.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = fs.readFileSync(path.join(__dirname, "../src/app/tarifs/page.tsx"), "utf8");

describe("tarifs : disponibilité de la signature électronique", () => {
  it("ne dit plus la signature absente", () => {
    expect(page).not.toContain("n&apos;est pas encore proposée");
  });
  it("nomme les circuits ouverts et ne promet pas un volume illimité", () => {
    for (const circuit of ["du bail", "cautionnement", "acceptation des devis"]) expect(page).toContain(circuit);
    expect(page).toContain("n&apos;est pas illimitée");
    expect(page).not.toMatch(/signatures? illimitée|SMS illimités|gratuite?s?\b.*signature/i);
  });
});
