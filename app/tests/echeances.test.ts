/**
 * Affichage des échéances : deux formes selon la place disponible — courte
 * dans une colonne de tableau, longue dans une phrase.
 */
import { describe, expect, it } from "vitest";
import { afficherEcheance, resumerBlocage } from "../src/lib/echeances";

describe("afficherEcheance — forme courte (colonne)", () => {
  const jour = new Date("2026-08-03T12:00:00Z");

  it("ne rend rien sans échéance", () => {
    expect(afficherEcheance(null, jour)).toBeNull();
  });

  it("annonce le dépassement en rouge, en jours abrégés", () => {
    const r = afficherEcheance("2026-07-11", jour)!;
    expect(r.texte).toBe("Dépassée de 23 j");
    expect(r.classe).toContain("destructive");
    expect(r.depassee).toBe(true);
  });

  it("nomme aujourd'hui et demain plutôt que de compter", () => {
    expect(afficherEcheance("2026-08-03", jour)!.texte).toBe("Aujourd'hui");
    expect(afficherEcheance("2026-08-04", jour)!.texte).toBe("Demain");
  });

  it("compte en jours jusqu'à quinzaine, puis donne la date", () => {
    expect(afficherEcheance("2026-08-15", jour)!.texte).toBe("Dans 12 j");
    expect(afficherEcheance("2026-09-15", jour)!.texte).toBe("15/09/2026");
  });
});

describe("afficherEcheance — forme longue (phrase)", () => {
  const jour = new Date("2026-08-03T12:00:00Z");

  it("s'insère dans une phrase, en jours pleins", () => {
    expect(afficherEcheance("2026-07-11", jour, "long")!.texte).toBe(
      "dépassée de 23 jours"
    );
    expect(afficherEcheance("2026-08-04", jour, "long")!.texte).toBe("à échéance demain");
  });
});

describe("resumerBlocage", () => {
  it("raccourcit les messages de la base pour une liste", () => {
    expect(resumerBlocage("Détention incomplète (0 % — il faut exactement 100 %)")).toBe(
      "Propriétaire non rattaché"
    );
    expect(resumerBlocage("DPE absent ou expiré (obligatoire en habitation)")).toBe(
      "DPE absent"
    );
    expect(resumerBlocage("Clé de répartition à (re)valider")).toBe(
      "Clé de répartition à valider"
    );
  });

  it("laisse passer un message qu'il ne connaît pas", () => {
    expect(resumerBlocage("Motif inédit")).toBe("Motif inédit");
  });
});
