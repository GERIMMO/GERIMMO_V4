/**
 * Le délai de rétractation (plan de conformité du 23/10/2026, R01, R02, R37) : jour de conclusion exclu, quatorze
 * jours, report au premier jour qui n'est ni un samedi, ni un dimanche, ni un jour férié, jusqu'à 23 h 59 min 59 s,
 * heure de Paris.
 */
import { describe, expect, it } from "vitest";
import {
  dernierJourRetractation,
  dimancheDePaques,
  estJourFerie,
  finDuDelaiRetractation,
  jourEnLettres,
  joursFeries,
  retractationOuverte,
} from "@/lib/delai-retractation";

describe("le calendrier des jours fériés", () => {
  it("Pâques tombe aux dates connues", () => {
    expect(dimancheDePaques(2024)).toBe("2024-03-31");
    expect(dimancheDePaques(2025)).toBe("2025-04-20");
    expect(dimancheDePaques(2026)).toBe("2026-04-05");
    expect(dimancheDePaques(2027)).toBe("2027-03-28");
  });

  it("onze jours fériés, dont les trois mobiles de 2026", () => {
    const f = joursFeries(2026);
    expect(f.size).toBe(11);
    for (const j of ["2026-01-01", "2026-04-06", "2026-05-01", "2026-05-08", "2026-05-14", "2026-05-25", "2026-07-14", "2026-08-15", "2026-11-01", "2026-11-11", "2026-12-25"])
      expect(f.has(j), j).toBe(true);
    expect(estJourFerie("2026-11-11")).toBe(true);
    expect(estJourFerie("2026-11-12")).toBe(false);
  });
});

describe("la date limite", () => {
  it("le jour de la conclusion n'est pas compté : un lundi donne le lundi deux semaines plus tard", () => {
    expect(dernierJourRetractation(new Date("2026-10-26T09:00:00Z"))).toBe("2026-11-09");
  });

  it("une échéance un samedi passe au lundi", () => {
    // Conclusion le samedi 24 octobre : 14 jours plus tard, samedi 7 novembre → lundi 9 novembre.
    expect(dernierJourRetractation(new Date("2026-10-24T10:00:00Z"))).toBe("2026-11-09");
  });

  it("une échéance un jour férié passe au lendemain ouvrable", () => {
    // Conclusion le mercredi 28 octobre : 14 jours plus tard, mercredi 11 novembre (férié) → jeudi 12 novembre.
    expect(dernierJourRetractation(new Date("2026-10-28T10:00:00Z"))).toBe("2026-11-12");
    // Un dimanche férié (1er novembre) → lundi 2 novembre.
    expect(dernierJourRetractation(new Date("2026-10-18T10:00:00Z"))).toBe("2026-11-02");
    // Un vendredi férié (1er mai) suivi d'un week-end → lundi 4 mai.
    expect(dernierJourRetractation(new Date("2026-04-17T10:00:00Z"))).toBe("2026-05-04");
  });

  it("le jour de conclusion est celui de Paris : 0 h 30 à Paris, c'est déjà le lendemain", () => {
    // 23 h 30 UTC le 27 octobre = 0 h 30 le 28 à Paris (heure d'hiver) : conclusion le 28, échéance le 12 novembre.
    expect(dernierJourRetractation(new Date("2026-10-27T23:30:00Z"))).toBe("2026-11-12");
  });

  it("la déclaration est reçue jusqu'à 23 h 59 min 59 s, heure de Paris, le dernier jour (hiver et été)", () => {
    const conclusion = new Date("2026-10-26T09:00:00Z");
    expect(finDuDelaiRetractation(conclusion).toISOString()).toBe("2026-11-09T22:59:59.000Z");
    expect(retractationOuverte(conclusion, new Date("2026-11-09T22:59:59Z"))).toBe(true);
    expect(retractationOuverte(conclusion, new Date("2026-11-09T23:00:00Z"))).toBe(false);
    // Heure d'été : 23 h 59 min 59 s à Paris = 21 h 59 min 59 s UTC.
    expect(finDuDelaiRetractation(new Date("2026-06-01T09:00:00Z")).toISOString()).toBe("2026-06-15T21:59:59.000Z");
  });

  it("sans date de conclusion, le délai n'est pas ouvert", () => {
    expect(retractationOuverte(null)).toBe(false);
    expect(retractationOuverte(new Date("invalide"))).toBe(false);
  });

  it("la date s'écrit en toutes lettres, « 1er » compris", () => {
    expect(jourEnLettres("2026-11-01")).toBe("1er novembre 2026");
    expect(jourEnLettres("2026-11-09")).toBe("9 novembre 2026");
  });
});
