/**
 * Le catalogue de scripts/vercel/variables.mjs et l'écran Santé disent la
 * même chose (25/09) : chaque variable que Santé compte comme point bloquant
 * est au catalogue hors « facultative », sinon le script dirait « complet »
 * à un projet que l'écran déclare en manque.
 */
import { describe, expect, it } from "vitest";
import { etatConfiguration } from "@/lib/sante-service";
import { CATALOGUE } from "../scripts/vercel/variables.mjs";

describe("catalogue des variables Vercel", () => {
  it("porte chaque variable que l'écran Santé vérifie, hors facultatives", () => {
    const bloquantes = CATALOGUE.filter((v) => v.groupe !== "facultative").map((v) => v.cle);
    for (const v of etatConfiguration({})) expect(bloquantes).toContain(v.cle);
  });

  it("nomme les deux variables publiques Supabase sans lesquelles rien ne se construit", () => {
    const socle = CATALOGUE.filter((v) => v.groupe === "socle").map((v) => v.cle);
    expect(socle).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(socle).toContain("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });
});
