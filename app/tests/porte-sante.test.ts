import { describe, expect, it } from "vitest";
import { SEUILS_SANTE, evaluerPorte } from "../src/lib/porte-sante";

const maintenant = new Date("2026-09-19T12:00:00Z");
const ilYA = (heures: number) => new Date(maintenant.getTime() - heures * 3_600_000).toISOString();
const toutesLesPasses = (heures = 5) =>
  Object.fromEntries(SEUILS_SANTE.tachesAttendues.map((t) => [t, { le: ilYA(heures) }]));

describe("la porte de santé", () => {
  it("s'ouvre quand toutes les tâches sont passées et que rien ne cloche", () => {
    const porte = evaluerPorte(
      { passes: toutesLesPasses(), erreursEcran24h: 2, bugsBloquantsOuverts: 0 },
      SEUILS_SANTE,
      maintenant
    );
    expect(porte).toEqual({ ouverte: true, motifs: [] });
  });

  it("se ferme, en le disant, pour une tâche jamais consignée ou en retard", () => {
    const passes = toutesLesPasses();
    delete passes.rappels;
    passes.appels = { le: ilYA(40) };
    const porte = evaluerPorte({ passes, erreursEcran24h: 0, bugsBloquantsOuverts: 0 }, SEUILS_SANTE, maintenant);
    expect(porte.ouverte).toBe(false);
    expect(porte.motifs).toEqual([
      "tâche « appels » : dernière passe il y a 40 h (limite 36 h)",
      "tâche « rappels » : aucune passe consignée",
    ]);
  });

  it("se ferme sur trop d'erreurs d'écran ou un bug bloquant", () => {
    const porte = evaluerPorte(
      { passes: toutesLesPasses(), erreursEcran24h: 6, bugsBloquantsOuverts: 1 },
      SEUILS_SANTE,
      maintenant
    );
    expect(porte.motifs).toEqual([
      "erreurs d'écran : 6 sur 24 h (limite 5)",
      "bugs bloquants ouverts : 1 (limite 0)",
    ]);
  });

  it("se ferme quand un compteur est illisible : ne pas savoir n'est pas aller bien", () => {
    const porte = evaluerPorte(
      { passes: toutesLesPasses(), erreursEcran24h: null, bugsBloquantsOuverts: null },
      SEUILS_SANTE,
      maintenant
    );
    expect(porte.ouverte).toBe(false);
    expect(porte.motifs).toEqual(["erreurs d'écran : compteur illisible", "bugs bloquants : compteur illisible"]);
  });

  it("tolère une passe exactement à la limite, pas au-delà", () => {
    const juste = evaluerPorte(
      { passes: toutesLesPasses(36), erreursEcran24h: 0, bugsBloquantsOuverts: 0 },
      SEUILS_SANTE,
      maintenant
    );
    expect(juste.ouverte).toBe(true);
    const trop = evaluerPorte(
      { passes: toutesLesPasses(36.5), erreursEcran24h: 0, bugsBloquantsOuverts: 0 },
      SEUILS_SANTE,
      maintenant
    );
    expect(trop.ouverte).toBe(false);
  });

  it("accepte d'autres seuils, écrits ailleurs", () => {
    const porte = evaluerPorte(
      { passes: {}, erreursEcran24h: 50, bugsBloquantsOuverts: 3 },
      { tachesAttendues: [], retardTacheHeures: 1, erreursEcranMax24h: 100, bugsBloquantsMax: 5 },
      maintenant
    );
    expect(porte.ouverte).toBe(true);
  });
});
