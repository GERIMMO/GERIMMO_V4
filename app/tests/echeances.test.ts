/**
 * Tests unitaires de l'affichage des échéances : un retard doit se voir,
 * une échéance lointaine doit rester discrète.
 */
import { describe, expect, it } from "vitest";
import { afficherEcheance } from "../src/lib/echeances";

describe("afficherEcheance", () => {
  const jour = new Date("2026-08-03T12:00:00Z");

  it("ne rend rien sans échéance", () => {
    expect(afficherEcheance(null, jour)).toBeNull();
  });

  it("annonce le retard en rouge, avec le nombre de jours", () => {
    const r = afficherEcheance("2026-07-31", jour)!;
    expect(r.texte).toBe("en retard de 3 jours");
    expect(r.classe).toContain("destructive");
  });

  it("accorde le singulier à un jour de retard", () => {
    expect(afficherEcheance("2026-08-02", jour)!.texte).toBe("en retard de 1 jour");
  });

  it("distingue aujourd'hui et l'imminent, en ton d'avertissement", () => {
    expect(afficherEcheance("2026-08-03", jour)!.texte).toBe("échéance aujourd'hui");
    const proche = afficherEcheance("2026-08-08", jour)!;
    expect(proche.texte).toBe("échéance dans 5 jours");
    expect(proche.classe).toContain("warning");
  });

  it("reste neutre au-delà d'une semaine et affiche la date en français", () => {
    const loin = afficherEcheance("2026-09-15", jour)!;
    expect(loin.texte).toBe("échéance le 15/09/2026");
    expect(loin.classe).toContain("muted");
  });
});
