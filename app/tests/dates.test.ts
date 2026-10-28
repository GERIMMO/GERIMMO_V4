/**
 * Audit final du 27/10 (COD-04) : le module commun des dates civiles (src/lib/dates.ts). Fin de mois, 29 février, passage
 * d'année, changement d'heure, saisies impossibles.
 */
import { describe, expect, it } from "vitest";
import { ajouterJours, ajouterMois, aujourdhuiParis, jourIsoValide } from "@/lib/dates";

describe("ajouterMois : le même jour, ramené au dernier jour du mois", () => {
  it.each([
    ["2026-01-31", 1, "2026-02-28"],
    ["2024-01-31", 1, "2024-02-29"],
    ["2026-11-30", 3, "2027-02-28"],
    ["2026-03-31", 1, "2026-04-30"],
    ["2026-01-15", 12, "2027-01-15"],
    ["2024-02-29", 12, "2025-02-28"],
    ["2026-03-31", -1, "2026-02-28"],
    ["2026-10-27", 72, "2032-10-27"],
    ["2026-10-27T10:00:00Z", 1, "2026-11-27"],
  ])("%s + %i mois = %s", (jour, n, attendu) => expect(ajouterMois(jour, n)).toBe(attendu));
});

describe("ajouterJours : jours de calendrier, sans fuseau", () => {
  it.each([
    ["2026-02-28", 1, "2026-03-01"],
    ["2024-02-28", 1, "2024-02-29"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-10-24", 2, "2026-10-26"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2026-10-27", 30, "2026-11-26"],
  ])("%s + %i = %s", (jour, n, attendu) => expect(ajouterJours(jour, n)).toBe(attendu));
});

describe("jourIsoValide", () => {
  it.each(["2026-02-28", "2024-02-29", "2026-12-31"])("%s est une date", (j) => expect(jourIsoValide(j)).toBe(true));
  it.each(["2026-02-30", "2025-02-29", "2026-13-01", "2026-00-10", "28/02/2027", "2026-2-1", "", " 2026-01-01", null, undefined, 20260101])(
    "%j n'en est pas une", (j) => expect(jourIsoValide(j)).toBe(false));
});

describe("aujourdhuiParis : le jour civil de Paris", () => {
  it.each([
    ["2026-10-31T22:30:00Z", "2026-10-31"], // heure d'hiver : 23 h 30 à Paris, encore le 31
    ["2026-10-31T23:30:00Z", "2026-11-01"], // 0 h 30 à Paris
    ["2026-06-30T22:30:00Z", "2026-07-01"], // heure d'été : 0 h 30 à Paris
    ["2026-06-30T21:30:00Z", "2026-06-30"],
    ["2026-03-29T00:30:00Z", "2026-03-29"], // nuit du passage à l'heure d'été
    ["2026-10-25T01:30:00Z", "2026-10-25"], // nuit du retour à l'heure d'hiver
  ])("%s → %s", (instant, attendu) => expect(aujourdhuiParis(new Date(instant))).toBe(attendu));
  it("sans argument, lit l'horloge", () => expect(jourIsoValide(aujourdhuiParis())).toBe(true));
});
