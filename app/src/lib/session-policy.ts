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

// ── Le cookie d'inactivité, signé (audit sécurité du 27/09) ─────────────────
// La valeur était un horodatage nu : un porteur du cookie pouvait le repousser
// à volonté et ne jamais atteindre la limite d'inactivité. Elle devient
// `<instant>.<HMAC-SHA256(compte.instant)>` : liée au compte, infalsifiable sans
// le secret. Une valeur absente, mal formée ou mal signée vaut « pas
// d'activité connue » — on retombe sur l'heure de connexion, jamais plus tard.

type Env = Record<string, string | undefined>;

/** Le secret de signature : dédié, sinon dérivé de la clé de service, sinon aucun. */
export function secretDActivite(env: Env = process.env): string | null {
  const dedie = env.GERIMMO_SESSION_SECRET?.trim();
  if (dedie) return `session:${dedie}`;
  const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return service ? `service:${service}` : null;
}

const encodeur = new TextEncoder();

async function cle(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encodeur.encode(`gerimmo-derniere-activite:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function versBase64Url(octets: Uint8Array): string {
  let binaire = "";
  for (const o of octets) binaire += String.fromCharCode(o);
  return btoa(binaire).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function depuisBase64Url(texte: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(texte)) return null;
  const b64 = texte.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (texte.length % 4)) % 4);
  try {
    const binaire = atob(b64);
    const octets = new Uint8Array(new ArrayBuffer(binaire.length));
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    return octets;
  } catch {
    return null;
  }
}

/** La valeur à poser dans le cookie pour `instant` (ms) et ce compte. */
export async function signerActivite(instant: number, compte: string, secret: string | null): Promise<string> {
  if (!secret) return String(instant);
  const signature = await crypto.subtle.sign("HMAC", await cle(secret), encodeur.encode(`${compte}.${instant}`));
  return `${instant}.${versBase64Url(new Uint8Array(signature))}`;
}

/** L'instant lu dans le cookie, ou null s'il est absent, mal formé ou mal signé. */
export async function lireActivite(valeur: string | undefined, compte: string, secret: string | null): Promise<number | null> {
  if (!valeur) return null;
  if (!secret) {
    const n = Number(valeur);
    return Number.isFinite(n) ? n : null;
  }
  const m = /^(\d{1,16})\.([A-Za-z0-9_-]+)$/.exec(valeur);
  if (!m) return null;
  const signature = depuisBase64Url(m[2]);
  if (!signature) return null;
  const valide = await crypto.subtle.verify("HMAC", await cle(secret), signature, encodeur.encode(`${compte}.${m[1]}`));
  return valide ? Number(m[1]) : null;
}
