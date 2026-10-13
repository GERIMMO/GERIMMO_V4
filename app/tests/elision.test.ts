/**
 * Audit du 13/10/2026 (LOC-02, PRO2-11) : « quittance de octobre 2026 », « Loyer de octobre à régler ».
 */
import { describe, expect, it } from "vitest";
import { deElide } from "../src/lib/elision";

describe("deElide", () => {
  it.each([
    ["octobre 2026", "d’octobre 2026"],
    ["avril 2027", "d’avril 2027"],
    ["août 2026", "d’août 2026"],
    ["Éloïse", "d’Éloïse"],
    ["Hélène", "d’Hélène"],
    ["septembre 2026", "de septembre 2026"],
    ["mars 2026", "de mars 2026"],
    ["  juin 2026 ", "de juin 2026"],
  ])("%s → %s", (mot, attendu) => expect(deElide(mot)).toBe(attendu));
});
