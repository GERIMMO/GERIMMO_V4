/**
 * Les en-têtes de sécurité HTTP (audit production 25/09, S1).
 *
 * Avant cette date, next.config.ts n'en posait aucun : les écrans de gérance
 * étaient encadrables par n'importe quel site. Ces tests gardent les
 * propriétés qui comptent : aucun cadre parent, aucun <object>, pas de
 * soumission de formulaire vers un tiers autre que Stripe, connexions
 * limitées à Supabase et à l'outillage Vercel, et une politique qui laisse
 * charger ce que le produit utilise réellement (Supabase, PDF en cadre, images).
 */
import { describe, expect, it } from "vitest";
import { ENTETES_SECURITE, politiqueDeSecurite } from "../next.config";

function directives(csp: string): Record<string, string[]> {
  return Object.fromEntries(
    csp.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
      const [nom, ...valeurs] = d.split(/\s+/);
      return [nom, valeurs];
    })
  );
}

describe("politique de sécurité du contenu", () => {
  const csp = directives(politiqueDeSecurite());

  it("interdit d'encadrer le site et d'y charger des objets", () => {
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
  });

  it("n'admet aucun script tiers hors de l'outillage Vercel", () => {
    const tiers = csp["script-src"].filter((v) => v.startsWith("http"));
    expect(tiers.every((v) => /vercel\.live|va\.vercel-scripts\.com/.test(v))).toBe(true);
    // Aucune adresse Stripe ni Google dans les scripts : le produit n'en charge pas.
    expect(csp["script-src"].join(" ")).not.toMatch(/stripe|google/);
  });

  it("laisse les formulaires partir vers le site et vers Stripe seulement", () => {
    expect(csp["form-action"]).toEqual(["'self'", "https://checkout.stripe.com", "https://billing.stripe.com"]);
  });

  it("autorise Supabase (appels et cadres PDF) et les aperçus blob:", () => {
    // La valeur exacte dépend de NEXT_PUBLIC_SUPABASE_URL au build ; sans
    // elle, le joker de la plateforme — jamais une liste vide.
    expect(csp["connect-src"].some((v) => /supabase|127\.0\.0\.1|localhost/.test(v))).toBe(true);
    expect(csp["frame-src"]).toContain("blob:");
    expect(csp["img-src"]).toEqual(expect.arrayContaining(["'self'", "data:", "blob:", "https:"]));
  });

  it("hors développement, n'admet pas eval ; force https seulement sur Vercel", () => {
    // Les tests tournent avec NODE_ENV=test : c'est la politique de production qu'on lit ici.
    expect(process.env.NODE_ENV).not.toBe("development");
    expect(csp["script-src"]).not.toContain("'unsafe-eval'");
    // La CI et le banc servent la construction en http (25/09) : pas de
    // montée forcée hors Vercel, sinon Chromium refuse les ressources.
    const vercel = process.env.VERCEL;
    delete process.env.VERCEL;
    expect(politiqueDeSecurite()).not.toContain("upgrade-insecure-requests");
    process.env.VERCEL = "1";
    expect(politiqueDeSecurite()).toContain("upgrade-insecure-requests");
    if (vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = vercel;
  });
});

describe("les autres en-têtes", () => {
  const parNom = Object.fromEntries(ENTETES_SECURITE.map((e) => [e.key, e.value]));

  it("posent chacun une valeur ferme", () => {
    expect(parNom["X-Frame-Options"]).toBe("DENY");
    expect(parNom["X-Content-Type-Options"]).toBe("nosniff");
    expect(parNom["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(parNom["Permissions-Policy"]).toMatch(/camera=\(\)/);
    expect(parNom["Strict-Transport-Security"]).toMatch(/max-age=\d{8,}; includeSubDomains/);
  });

  it("ne contiennent ni secret ni retour à la ligne", () => {
    for (const { value } of ENTETES_SECURITE) {
      expect(value).not.toMatch(/[\r\n]/);
      expect(value).not.toMatch(/sk_live|sk_test|whsec|eyJ/);
    }
  });
});
