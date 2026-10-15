/**
 * X03 (AUD-B-03, décision du 14/10/2026) — le drapeau `Secure` du cookie de session
 * ne dépend plus de la seule variable NEXT_PUBLIC_SITE_URL : il se dérive AUSSI de
 * l'environnement de production (VERCEL_ENV === "production"), et n'est jamais
 * moins strict qu'avant.
 *
 * Avant : adresse du site absente ou en http en production → cookie de session sans
 * `Secure`, donc envoyable en clair, sans aucune alerte.
 * Banc local et CI (construction de production servie en http) : le cookie doit
 * rester lisible, donc ni NODE_ENV ni « production » seul ne suffisent — d'où
 * VERCEL_ENV, que seule la plateforme pose.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

async function cookies(env: { site?: string; vercel?: string; vercelPublic?: string }) {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", env.site ?? "");
  vi.stubEnv("VERCEL_ENV", env.vercel ?? "");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", env.vercelPublic ?? "");
  return (await import("../src/lib/supabase/cookies")).COOKIES_SESSION;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("X03 — drapeau Secure du cookie de session", () => {
  it("production Vercel sans adresse du site : Secure (le défaut relevé par l'audit)", async () => {
    expect((await cookies({ vercel: "production" })).secure).toBe(true);
  });

  it("production Vercel avec une adresse du site mal posée en http : Secure quand même", async () => {
    expect((await cookies({ vercel: "production", site: "http://gerimmo.example" })).secure).toBe(true);
  });

  it("l'environnement de production exposé au navigateur suffit aussi (NEXT_PUBLIC_VERCEL_ENV)", async () => {
    expect((await cookies({ vercelPublic: "production" })).secure).toBe(true);
  });

  it("jamais moins strict qu'avant : adresse du site en https → Secure, quel que soit l'environnement", async () => {
    expect((await cookies({ site: "https://gerimmo.example" })).secure).toBe(true);
    expect((await cookies({ site: "https://gerimmo.example", vercel: "preview" })).secure).toBe(true);
    expect((await cookies({ site: "https://gerimmo.example", vercel: "development" })).secure).toBe(true);
  });

  it("banc local et CI en http, hors production Vercel : le cookie reste lisible", async () => {
    expect((await cookies({ site: "http://localhost:3100" })).secure).toBe(false);
    expect((await cookies({})).secure).toBe(false);
  });

  it("une prévisualisation ou un développement Vercel sans https ne force pas Secure (rien de plus strict que décidé)", async () => {
    expect((await cookies({ vercel: "preview" })).secure).toBe(false);
    expect((await cookies({ vercel: "development" })).secure).toBe(false);
  });

  it("SameSite=Lax est conservé", async () => {
    expect((await cookies({ vercel: "production" })).sameSite).toBe("lax");
  });
});

describe("X03 — la fonction de dérivation", () => {
  it("est vraie si l'une OU l'autre condition l'est, fausse sinon", async () => {
    const { cookieSessionSecurise } = await import("../src/lib/supabase/cookies");
    expect(cookieSessionSecurise({ adresseSite: "https://a.example" })).toBe(true);
    expect(cookieSessionSecurise({ environnement: "production" })).toBe(true);
    expect(cookieSessionSecurise({ adresseSite: "http://a.example", environnement: "production" })).toBe(true);
    expect(cookieSessionSecurise({ adresseSite: "http://a.example", environnement: "preview" })).toBe(false);
    expect(cookieSessionSecurise({})).toBe(false);
    expect(cookieSessionSecurise({ adresseSite: undefined, environnement: undefined })).toBe(false);
  });
});
