import { describe, expect, it } from "vitest";
import { PHASES, phaseValide, prochainAngle, rendezVousEditorial } from "@/lib/phases-marketing";

describe("programmation marketing", () => {
  it("propose un nouveau sujet de lancement puis poursuit avec des points pratiques renouvelés chaque mois", () => {
    const titres = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const sujet = prochainAngle("lancement", titres);
      expect(sujet).toBeDefined();
      titres.add(sujet!.titre);
    }
    expect(titres.size).toBe(5);
    for(const mois of ["2026-11","2026-12","2027-01"]){
      for(let i=0;i<10;i++){
        const sujet=rendezVousEditorial("lancement",mois+"-15",titres,"trafic")!;
        expect(titres.has(sujet.titre)).toBe(false);
        expect(sujet.action).toContain("sans carte bancaire");
        if(!i)expect(sujet.objectif).toBe("trafic");
        titres.add(sujet.titre);
      }
    }
    expect(titres.size).toBe(35);
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
