/**
 * Les liens envoyés par e-mail suivent la configuration, jamais l'en-tête
 * `Origin` de la requête (audit sécurité du 27/09).
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adresseDeRetour } from "../src/lib/site";

afterEach(() => vi.unstubAllEnvs());

describe("adresse de retour des e-mails", () => {
  it("prend NEXT_PUBLIC_SITE_URL, sinon l'adresse Vercel, sinon rien", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://gerimmo.app/");
    expect(adresseDeRetour()).toBe("https://gerimmo.app");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "gerimmo.vercel.app");
    expect(adresseDeRetour()).toBe("https://gerimmo.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "");
    expect(adresseDeRetour()).toBe("");
  });

  it.each(["auth", "invitations", "organisations-admin", "loyers", "baux"])(
    "l'action %s ne lit plus l'en-tête Origin",
    (fichier) => {
      const source = readFileSync(new URL(`../src/app/actions/${fichier}.ts`, import.meta.url), "utf-8");
      expect(source).not.toMatch(/get\(["']origin["']\)/);
      expect(source).toContain("adresseDeRetour()");
    }
  );
});
