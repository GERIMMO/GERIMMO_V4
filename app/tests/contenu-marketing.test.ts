import { describe, expect, it } from "vitest";
import { sujetMarketing } from "@/lib/contenu-marketing";

describe("rotation éditoriale automatique", () => {
  it("choisit deux sujets distincts pour les deux passages de la semaine", () => {
    const date = new Date("2026-09-22T12:00:00Z");
    expect(sujetMarketing(date, 0).cle).not.toBe(sujetMarketing(date, 1).cle);
  });

  it("reste déterministe lors d'une relance du même passage", () => {
    const date = new Date("2026-09-25T12:00:00Z");
    expect(sujetMarketing(date, 1)).toEqual(sujetMarketing(date, 1));
  });

  it("fait varier les publics au fil des semaines", () => {
    const publics = new Set<string>();
    for (let semaine = 0; semaine < 12; semaine += 1) {
      const date = new Date(Date.UTC(2026, 0, 6 + semaine * 7, 12));
      publics.add(sujetMarketing(date, 0).audience);
      publics.add(sujetMarketing(date, 1).audience);
    }
    expect(publics).toEqual(new Set(["particuliers", "locataires", "professionnels", "artisans"]));
  });
});
