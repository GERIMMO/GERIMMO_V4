import { describe, expect, it } from "vitest";
import { mesurerAutomatisation } from "../src/lib/automatisation";

describe("mesure d'automatisation", () => {
  it("compte les résultats réalisés et ignore les échecs", () => {
    const mesure = mesurerAutomatisation([
      { evenement: "tache_quittances", details: { envoyees: 4, echecs: 1 }, created_at: "2026-09-22" },
      { evenement: "tache_marketing", details: { agi: true, facebook: true }, created_at: "2026-09-22" },
    ], 1, 2, 3);
    expect(mesure.actionsAutomatiques).toBe(5);
    expect(mesure.taux).toBe(83);
    expect(mesure.clicsEvites).toBe(15);
    expect(mesure.messagesEnvoyes).toBe(7);
  });

  it("n'invente pas de taux sans activité", () => {
    expect(mesurerAutomatisation([], 0, 0, 0).taux).toBeNull();
  });
});
