/**
 * Garde anti « open redirect » de la mémoire de destination.
 *
 * Depuis le 11/09, le proxy mémorise la page demandée avant la connexion
 * (`?suite=`) et le formulaire y retourne. Ce paramètre vient de l'URL : il est
 * donc entièrement sous le contrôle de qui fabrique le lien. Sans garde, un
 * courriel d'hameçonnage pointant vers
 *   https://gerimmo.fr/connexion?suite=https://faux-gerimmo.fr
 * ferait atterrir l'utilisateur sur le site de l'attaquant APRÈS une connexion
 * réussie sur le vrai site — le moment où il est le plus en confiance.
 */
import { describe, expect, it } from "vitest";
import { destinationSure } from "@/lib/destination-sure";

describe("destinationSure", () => {
  it("suit un chemin interne", () => {
    expect(destinationSure("/quittance/abc")).toBe("/quittance/abc");
    expect(destinationSure("/agence/1/parc?filtre=loue")).toBe("/agence/1/parc?filtre=loue");
  });

  it("refuse une URL absolue", () => {
    expect(destinationSure("https://faux-gerimmo.fr")).toBe("/espaces");
    expect(destinationSure("http://faux-gerimmo.fr/piege")).toBe("/espaces");
  });

  it("refuse un chemin protocole-relatif, qui vaut une URL absolue", () => {
    // « //ailleurs » commence bien par « / » : c'est exactement le piège que
    // la vérification naïve `startsWith("/")` laisse passer.
    expect(destinationSure("//faux-gerimmo.fr")).toBe("/espaces");
    expect(destinationSure("//faux-gerimmo.fr/piege")).toBe("/espaces");
  });

  it("refuse ce qui n'est pas un chemin, et retombe sur le repli", () => {
    expect(destinationSure(null)).toBe("/espaces");
    expect(destinationSure(undefined)).toBe("/espaces");
    expect(destinationSure("")).toBe("/espaces");
    expect(destinationSure("javascript:alert(1)")).toBe("/espaces");
    expect(destinationSure("espaces")).toBe("/espaces");
  });

  it("accepte un repli propre à l'appelant", () => {
    expect(destinationSure(null, "/locataire/1")).toBe("/locataire/1");
    expect(destinationSure("https://ailleurs", "/locataire/1")).toBe("/locataire/1");
  });
});
