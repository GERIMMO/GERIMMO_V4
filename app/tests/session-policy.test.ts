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

// Audit sécurité du 27/09 : le cookie d'inactivité était un horodatage nu,
// qu'un porteur pouvait repousser à volonté. Il est signé et lié au compte.
import { lireActivite, secretDActivite, signerActivite } from "../src/lib/session-policy";

describe("Cookie d'inactivité signé (audit 27/09)", () => {
  const secret = secretDActivite({ GERIMMO_SESSION_SECRET: "un-secret-de-recette-suffisamment-long" });

  it("relit l'instant qu'il a signé, pour le même compte", async () => {
    const valeur = await signerActivite(1_700_000_000_000, "compte-a", secret);
    expect(valeur).toMatch(/^1700000000000\.[A-Za-z0-9_-]{20,}$/);
    expect(await lireActivite(valeur, "compte-a", secret)).toBe(1_700_000_000_000);
  });

  it("refuse un horodatage repoussé, un cookie d'un autre compte ou une valeur nue", async () => {
    const valeur = await signerActivite(1_700_000_000_000, "compte-a", secret);
    const [, signature] = valeur.split(".");
    expect(await lireActivite(`1800000000000.${signature}`, "compte-a", secret)).toBeNull();
    expect(await lireActivite(valeur, "compte-b", secret)).toBeNull();
    expect(await lireActivite("1800000000000", "compte-a", secret)).toBeNull();
    expect(await lireActivite("n'importe quoi", "compte-a", secret)).toBeNull();
    expect(await lireActivite(undefined, "compte-a", secret)).toBeNull();
  });

  it("choisit le secret dédié, sinon une clé dérivée de la clé de service, sinon aucun (banc local)", async () => {
    expect(secretDActivite({ GERIMMO_SESSION_SECRET: "a", SUPABASE_SERVICE_ROLE_KEY: "b" })).toBe("session:a");
    expect(secretDActivite({ SUPABASE_SERVICE_ROLE_KEY: "b" })).toBe("service:b");
    expect(secretDActivite({})).toBeNull();
    // Sans secret, l'ancien format reste lu (développement local seulement).
    expect(await signerActivite(42, "c", null)).toBe("42");
    expect(await lireActivite("42", "c", null)).toBe(42);
  });
});
