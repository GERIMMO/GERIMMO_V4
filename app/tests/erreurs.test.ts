/**
 * Les messages d'exception de la base portent une référence interne au
 * référentiel : elle doit disparaître de l'écran sans abîmer la phrase.
 */
import { describe, expect, it } from "vitest";
import { sansJargon } from "../src/lib/erreurs";

describe("sansJargon", () => {
  it("retire la référence interne en fin de phrase", () => {
    expect(sansJargon("Mois clôturé : imputez au mois ouvert (RM-4.4.1)")).toBe(
      "Mois clôturé : imputez au mois ouvert"
    );
  });

  it("retire aussi la référence suivie d'un point", () => {
    expect(sansJargon("Le fonds ALUR n'est jamais récupérable (RM-0c.3.4).")).toBe(
      "Le fonds ALUR n'est jamais récupérable"
    );
  });

  it("laisse intact un message sans référence", () => {
    const m = "La somme des quote-parts dépasserait 100 %";
    expect(sansJargon(m)).toBe(m);
  });

  it("ne laisse pas la phrase se terminer sur un tiret orphelin", () => {
    expect(sansJargon("Détention historique — (RM-0.2.4)")).toBe("Détention historique");
  });

  it("rend un message par défaut plutôt que rien", () => {
    expect(sansJargon(null)).toBe("Une erreur est survenue.");
    expect(sansJargon("(RM-1.2.3)")).toBe("Une erreur est survenue.");
  });
});
