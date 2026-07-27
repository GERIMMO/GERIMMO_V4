/**
 * Tests unitaires — sessions par rôle (RM-A4.5).
 * La limite la plus stricte des adhésions actives s'applique.
 */
import { describe, expect, it } from "vitest";
import { strictestLimits } from "../src/lib/session-policy";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("Sessions par rôle (RM-A4.5)", () => {
  it("applique 30 min / 8 h au super admin", () => {
    expect(strictestLimits(["super_admin"])).toEqual({
      inactivity: 30 * MINUTE,
      absolute: 8 * HOUR,
    });
  });

  it("applique 2 h / 12 h à l'admin d'agence", () => {
    expect(strictestLimits(["admin_agence"])).toEqual({
      inactivity: 2 * HOUR,
      absolute: 12 * HOUR,
    });
  });

  it("applique 7 j / 30 j au locataire et à l'artisan", () => {
    for (const role of ["locataire", "artisan"]) {
      expect(strictestLimits([role])).toEqual({
        inactivity: 7 * DAY,
        absolute: 30 * DAY,
      });
    }
  });

  it("retient la limite la plus stricte en cas de double adhésion", () => {
    // agent chez Alpha (4 h/12 h) + locataire chez Beta (7 j/30 j) => agent
    expect(strictestLimits(["agent", "locataire"])).toEqual({
      inactivity: 4 * HOUR,
      absolute: 12 * HOUR,
    });
  });

  it("croise les minima quand les rôles diffèrent sur chaque axe", () => {
    // super_admin (30 min/8 h) + admin_agence (2 h/12 h) => 30 min / 8 h
    expect(strictestLimits(["admin_agence", "super_admin"])).toEqual({
      inactivity: 30 * MINUTE,
      absolute: 8 * HOUR,
    });
  });

  it("retombe sur la limite agent pour un rôle inconnu ou sans adhésion", () => {
    const parDefaut = { inactivity: 4 * HOUR, absolute: 12 * HOUR };
    expect(strictestLimits([])).toEqual(parDefaut);
    expect(strictestLimits(["role_inconnu"])).toEqual(parDefaut);
  });
});
