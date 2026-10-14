/**
 * Audit du 13/10/2026 (AUD-B-02) : un nom de 24 000 caractères était accepté à
 * l'inscription, puis rendait le compte inutilisable (cookies de session de
 * 77 Ko, « 431 » sur tout le site). Les champs d'identité ont une borne, dite
 * en clair, côté serveur.
 */
import { describe, expect, it } from "vitest";
import { LONGUEUR_MAX, champTropLong, valeursBornees } from "../src/lib/limites-saisie";

describe("champTropLong", () => {
  it("laisse passer des saisies ordinaires, accents compris", () => {
    expect(
      champTropLong({
        nom: "Élodie Hérault-Bénéteau",
        prenom: "Zoé",
        email: "zoe@example.fr",
        telephone: "06 12 34 56 78",
        adresse: "12 rue des Lilas, résidence Les Hauts d'Été",
        code_postal: "75011",
        ville: "Saint-Rémy-lès-Chevreuse",
      })
    ).toBeNull();
  });

  it("accepte exactement la borne et refuse un caractère de plus", () => {
    expect(champTropLong({ nom: "a".repeat(LONGUEUR_MAX.nom) })).toBeNull();
    expect(champTropLong({ nom: "a".repeat(LONGUEUR_MAX.nom + 1) })).toBe(
      "Le nom est trop long : 100 caractères au plus."
    );
  });

  it("refuse le cas de l'audit : 24 000 caractères", () => {
    expect(champTropLong({ nom: "x".repeat(24_000) })).toMatch(/trop long/);
  });

  it("nomme le champ fautif, pas un autre", () => {
    expect(champTropLong({ nom: "Dupont", adresse: "a".repeat(201) })).toBe(
      "L'adresse est trop longue : 200 caractères au plus."
    );
  });

  it("compte les caractères, pas les octets : 100 émojis passent, 101 non", () => {
    expect(champTropLong({ prenom: "😀".repeat(100) })).toBeNull();
    expect(champTropLong({ prenom: "😀".repeat(101) })).toMatch(/prénom/);
  });

  it("ignore les champs absents ou vides", () => {
    expect(champTropLong({ nom: undefined, prenom: null, ville: "" })).toBeNull();
  });
});

describe("valeursBornees", () => {
  it("coupe chaque valeur à 300 caractères et garde les autres champs", () => {
    const r = valeursBornees({ nom: "x".repeat(24_000), ville: "Lyon" });
    expect([...r.nom]).toHaveLength(300);
    expect(r.ville).toBe("Lyon");
  });
});
