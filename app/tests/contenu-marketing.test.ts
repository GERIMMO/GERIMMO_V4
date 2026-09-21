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
});
