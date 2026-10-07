/**
 * L'heure de Paris calculée (06/10/2026) : le réglage « 9 h » doit valoir
 * 9 h à Paris avant ET après le passage à l'heure d'hiver du 25/10/2026.
 * Miroir de la fonction SQL `instant_paris`.
 */
import { describe, expect, it } from "vitest";
import { composantesParis, dateParis, instantParis, isodow, lendemain } from "@/lib/heure-paris-calcul";

describe("instantParis", () => {
  it("9 h à Paris = 7 h UTC en été, 8 h UTC en hiver", () => {
    expect(instantParis("2026-10-23", 9).toISOString()).toBe("2026-10-23T07:00:00.000Z");
    expect(instantParis("2026-10-26", 9).toISOString()).toBe("2026-10-26T08:00:00.000Z");
  });
  it("le jour du changement d'heure (25/10/2026), 9 h est après le recul : 8 h UTC", () => {
    expect(instantParis("2026-10-25", 9).toISOString()).toBe("2026-10-25T08:00:00.000Z");
    expect(instantParis("2026-10-25", 1).toISOString()).toBe("2026-10-24T23:00:00.000Z");
  });
  it("18 h la veille d'une parution", () => {
    expect(instantParis("2026-10-08", 18).toISOString()).toBe("2026-10-08T16:00:00.000Z");
  });
});

describe("lecture de Paris", () => {
  it("date et jour ISO depuis un instant universel", () => {
    expect(dateParis(new Date("2026-10-08T22:30:00Z"))).toBe("2026-10-09");
    expect(composantesParis(new Date("2026-10-08T22:30:00Z")).isodow).toBe(5);
    expect(lendemain("2026-10-31")).toBe("2026-11-01");
    expect(isodow("2026-10-06")).toBe(2);
    expect(isodow("2026-10-11")).toBe(7);
  });
});
