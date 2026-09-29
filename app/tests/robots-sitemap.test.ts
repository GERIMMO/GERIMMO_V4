/**
 * robots.txt et sitemap.xml (29/09). Avant, aucun des deux n'existait, et le
 * proxy renvoyait /robots.txt vers la connexion : un moteur ne lisait ni les
 * règles ni le plan du site.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import robots from "../src/app/robots";
import sitemap from "../src/app/sitemap";

const APP = path.resolve(__dirname, "../src/app");
const site = process.env.NEXT_PUBLIC_SITE_URL;
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;

afterEach(() => {
  if (site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = site;
  if (supabase === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = supabase;
});

/** Les chemins publics déclarés dans le proxy. */
function cheminsPublics(): string[] {
  const proxy = readFileSync(path.resolve(__dirname, "../src/proxy.ts"), "utf8");
  const liste = proxy.slice(proxy.indexOf("const PUBLIC_PATHS"), proxy.indexOf("const REDIRECT_SI_CONNECTE"));
  return [...liste.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);
}

describe("robots.txt", () => {
  it("ouvre le site et ferme chaque espace privé de src/app", () => {
    const r = robots();
    const regle = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    const interdits = ([] as string[]).concat(regle.disallow ?? []);
    const permis = ([] as string[]).concat(regle.allow ?? []);
    expect(permis).toContain("/");
    const publics = new Set(cheminsPublics().map((c) => c.split("/")[1]));
    const prives = readdirSync(APP, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("(") && d.name !== "polices")
      .map((d) => d.name)
      .filter((nom) => !publics.has(nom) || nom === "artisan");
    for (const nom of prives) expect(interdits).toContain(`/${nom}`);
    // Aucune page publique n'est fermée aux robots.
    for (const nom of ["conditions", "confidentialite", "mentions-legales", "journal", "tarifs", "outils", "connexion", "inscription"]) {
      expect(interdits).not.toContain(`/${nom}`);
    }
    // /artisan est privé, sauf son inscription (règle la plus longue).
    expect(permis).toContain("/artisan/inscription");
  });

  it("désigne le plan du site par une adresse absolue", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.gerimmo.app/";
    expect(robots().sitemap).toBe("https://www.gerimmo.app/sitemap.xml");
  });

  it("est public dans le proxy, comme le plan du site", () => {
    expect(cheminsPublics()).toEqual(expect.arrayContaining(["/robots.txt", "/sitemap.xml"]));
  });
});

describe("sitemap.xml", () => {
  it("liste les pages publiques en adresses absolues, même sans base configurée", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.gerimmo.app";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toEqual([
      "https://www.gerimmo.app",
      "https://www.gerimmo.app/tarifs",
      "https://www.gerimmo.app/journal",
      "https://www.gerimmo.app/outils",
      "https://www.gerimmo.app/outils/calcul-irl",
      "https://www.gerimmo.app/outils/quittance-de-loyer",
      "https://www.gerimmo.app/outils/comparateur-gli-visale",
      "https://www.gerimmo.app/outils/simulateur-lmnp",
      "https://www.gerimmo.app/outils/rentabilite-locative",
      "https://www.gerimmo.app/conditions",
      "https://www.gerimmo.app/mentions-legales",
      "https://www.gerimmo.app/confidentialite",
    ]);
  });
});
