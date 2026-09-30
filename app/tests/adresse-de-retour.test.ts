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

  it.each(["loyers", "baux"])(
    "l'action %s ne lit plus l'en-tête Origin, et refuse d'envoyer sans adresse configurée (30/09, B4)",
    (fichier) => {
      const source = readFileSync(new URL(`../src/app/actions/${fichier}.ts`, import.meta.url), "utf-8");
      expect(source).not.toMatch(/get\(["']origin["']\)/);
      expect(source).toContain("adresseDeRetour()");
      expect(source).toContain("if (!origine) return { erreur: MESSAGE_SITE_NON_CONFIGURE }");
    }
  );

  // 30/09 (M2) : inviter un agent déjà inscrit lit la configuration, jamais
  // l'en-tête Origin, et n'envoie rien sans adresse.
  it("l'action organisation ne lit plus l'en-tête Origin", () => {
    const source = readFileSync(new URL("../src/app/actions/organisation.ts", import.meta.url), "utf-8");
    expect(source).not.toMatch(/get\(["']origin["']\)/);
    expect(source).not.toContain('from "next/headers"');
    expect(source).toContain("adresseDuSite()");
    expect(source).toContain("MESSAGE_SITE_NON_CONFIGURE");
  });

  // 30/09 : les invitations ET l'inscription passent par la fabrique de liens,
  // qui lit la configuration (adresseDuSite) et jamais la requête.
  it("l'inscription ne construit plus aucun lien elle-même (plus de signUp ni d'emailRedirectTo)", () => {
    const source = readFileSync(new URL("../src/app/actions/auth.ts", import.meta.url), "utf-8");
    expect(source).not.toMatch(/get\(["']origin["']\)/);
    expect(source).not.toContain("signUp(");
    expect(source).not.toContain("emailRedirectTo");
    expect(source).toContain("inscrireEtEnvoyerConfirmation(");
  });

  it.each(["invitations", "organisations-admin", "controle-supervision"])(
    "l'action %s confie son lien à lib/lien-mot-de-passe.ts",
    (fichier) => {
      const source = readFileSync(new URL(`../src/app/actions/${fichier}.ts`, import.meta.url), "utf-8");
      expect(source).not.toMatch(/get\(["']origin["']\)/);
      expect(source).not.toContain("resetPasswordForEmail");
      expect(source).toContain("envoyerLienMotDePasse(");
    }
  );

  it("la fabrique de liens suit la configuration, pas l'en-tête Origin", () => {
    const source = readFileSync(new URL("../src/lib/lien-mot-de-passe.ts", import.meta.url), "utf-8");
    expect(source).not.toMatch(/get\(["']origin["']\)/);
    expect(source).toContain("adresseDuSite()");
  });
});
