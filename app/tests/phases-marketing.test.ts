import { describe, expect, it } from "vitest";
import { PHASES, phaseValide, prochainAngle } from "@/lib/phases-marketing";

describe("programmation marketing", () => {
  it("propose un nouveau sujet de lancement puis signale un catalogue épuisé", () => {
    const titres = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const sujet = prochainAngle("lancement", titres);
      expect(sujet).toBeDefined();
      titres.add(sujet!.titre);
    }
    expect(titres.size).toBe(5);
    expect(prochainAngle("lancement", titres)).toBeUndefined();
  });
  it("toutes les phases ont une action et la phase commerciale ne promet aucune vente", () => {
    for (const phase of Object.keys(PHASES)) {
      if (!phaseValide(phase)) throw Error("Phase invalide");
      expect(prochainAngle(phase,new Set())?.action).toBeTruthy();
    }
    expect(prochainAngle("commercial",new Set())?.action).toContain("essai gratuit");
    expect(phaseValide("__proto__")).toBe(false);
  });
});
