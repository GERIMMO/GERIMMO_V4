/**
 * Les heures de la console, à l'heure de Paris (25/09) : le serveur tourne en
 * UTC, l'écran ne doit jamais le laisser voir.
 */
import { describe, expect, it } from "vitest";
import {
  borneJourParis,
  formaterDateHeureLongueParis,
  formaterDateHeureParis,
  formaterDateParis,
  formaterHeureParis,
  NOTE_FUSEAU,
} from "../src/lib/heure-paris";

describe("les heures à l'heure de Paris", () => {
  // 09:00 UTC en été = 11:00 à Paris ; 23:30 UTC en hiver = 00:30 le lendemain.
  it("décale l'heure d'été et d'hiver, et change de jour quand il faut", () => {
    expect(formaterDateHeureParis("2026-09-25T09:00:00.000Z")).toBe("25/09/2026 11:00");
    expect(formaterDateHeureParis("2026-01-10T23:30:00.000Z")).toBe("11/01/2026 00:30");
    expect(formaterDateParis("2026-01-10T23:30:00.000Z")).toBe("11/01/2026");
    expect(formaterHeureParis("2026-09-25T09:00:00.000Z")).toBe("11:00");
    expect(formaterDateHeureLongueParis("2026-09-25T09:00:00.000Z")).toMatch(/25 sept\. 2026,? 11:00/);
  });

  it("rend un tiret ou le repli demandé pour une valeur absente ou invalide", () => {
    expect(formaterDateHeureParis(null)).toBe("—");
    expect(formaterDateParis("")).toBe("—");
    expect(formaterHeureParis("pas une date")).toBe("—");
    expect(formaterDateHeureLongueParis(null, "Date à choisir")).toBe("Date à choisir");
  });

  it("borne une journée de Paris en UTC, avec le décalage du jour", () => {
    expect(borneJourParis("2026-09-25")).toBe("2026-09-24T22:00:00.000Z");
    expect(borneJourParis("2026-09-25", true)).toBe("2026-09-25T21:59:59.999Z");
    expect(borneJourParis("2026-01-10")).toBe("2026-01-09T23:00:00.000Z");
    expect(borneJourParis("25/09/2026")).toBeNull();
    expect(borneJourParis("2026-13-45")).toBeNull();
  });

  it("dit le fuseau une fois, en français", () => {
    expect(NOTE_FUSEAU).toMatch(/heure de Paris/);
  });
});
