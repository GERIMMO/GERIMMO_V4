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

  it.each([
    ["2026-03-29", "2026-03-28T23:00:00.000Z", "2026-03-29T21:59:59.999Z", 23],
    ["2026-10-25", "2026-10-24T22:00:00.000Z", "2026-10-25T22:59:59.999Z", 25],
  ])("garde toute la journée du %s lors du changement d’heure", (jour, debut, fin, heures) => {
    expect(borneJourParis(jour)).toBe(debut);
    expect(borneJourParis(jour, true)).toBe(fin);
    expect(Date.parse(borneJourParis(jour, true)!) - Date.parse(borneJourParis(jour)!) + 1)
      .toBe(heures * 60 * 60 * 1000);
    // Les événements de minuit et de la dernière milliseconde restent inclus.
    expect(formaterDateParis(borneJourParis(jour))).toBe(jour.split("-").reverse().join("/"));
    expect(formaterHeureParis(borneJourParis(jour))).toBe("00:00");
  });

  it.each(["2026-02-29", "2026-02-31", "2026-04-31", "2026-00-01", "2026-01-00"])
    ("refuse le jour inexistant %s au lieu de le déplacer", (jour) => {
      expect(borneJourParis(jour)).toBeNull();
      expect(borneJourParis(jour, true)).toBeNull();
    });

  it("conserve les journées bissextiles et la continuité entre les jours", () => {
    expect(borneJourParis("2024-02-29")).toBe("2024-02-28T23:00:00.000Z");
    for (const [avant, apres] of [
      ["2026-03-28", "2026-03-29"], ["2026-03-29", "2026-03-30"],
      ["2026-10-24", "2026-10-25"], ["2026-10-25", "2026-10-26"],
    ]) {
      expect(Date.parse(borneJourParis(apres)!)).toBe(Date.parse(borneJourParis(avant, true)!) + 1);
    }
  });

  it("dit le fuseau une fois, en français", () => {
    expect(NOTE_FUSEAU).toMatch(/heure de Paris/);
  });
});
