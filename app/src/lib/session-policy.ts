// Sessions par rôle (RM-A4.5) : inactivité / durée absolue, en millisecondes.
// Si un compte cumule plusieurs adhésions, la limite la plus stricte s'applique.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type SessionLimits = { inactivity: number; absolute: number };

const LIMITS: Record<string, SessionLimits> = {
  super_admin: { inactivity: 30 * MINUTE, absolute: 8 * HOUR },
  admin_agence: { inactivity: 2 * HOUR, absolute: 12 * HOUR },
  agent: { inactivity: 4 * HOUR, absolute: 12 * HOUR },
  proprietaire_direct: { inactivity: 4 * HOUR, absolute: 12 * HOUR },
  proprietaire_mandant: { inactivity: 7 * DAY, absolute: 30 * DAY },
  locataire: { inactivity: 7 * DAY, absolute: 30 * DAY },
  artisan: { inactivity: 7 * DAY, absolute: 30 * DAY },
  garant: { inactivity: 7 * DAY, absolute: 30 * DAY },
};

const DEFAULT_LIMITS: SessionLimits = LIMITS.agent;

export function strictestLimits(roles: string[]): SessionLimits {
  const applicable = roles
    .map((r) => LIMITS[r])
    .filter((l): l is SessionLimits => l !== undefined);
  if (applicable.length === 0) return DEFAULT_LIMITS;
  return {
    inactivity: Math.min(...applicable.map((l) => l.inactivity)),
    absolute: Math.min(...applicable.map((l) => l.absolute)),
  };
}

export const ACTIVITY_COOKIE = "gerimmo-derniere-activite";
