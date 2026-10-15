/**
 * Mise en cache du logo et des illustrations (décision D45 A, fiche PRF-05 du 13/10/2026).
 *
 * Next.js sert tout le dossier `public/` avec `Cache-Control: public, max-age=0` : le navigateur revalide le logo
 * (292 Ko) et l'illustration de fond (298 Ko) à chaque page. Ces fichiers n'ont pas de nom versionné (pas d'empreinte
 * dans le nom) : une durée longue les figerait chez les visiteurs si l'on remplaçait l'image sous le même nom. La règle
 * posée est donc une durée COURTE avec revalidation en arrière-plan. Une durée longue ne se justifie qu'avec un nom
 * versionné (ex. `gerimmo-officiel-v2.png`) : il n'y en a pas aujourd'hui, et ce test échoue si l'on en promet une.
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig, { CACHE_IMAGES_DE_MARQUE } from "../next.config";

type Regle = { source: string; headers: { key: string; value: string }[] };

async function regles(): Promise<Regle[]> {
  return (await nextConfig.headers!()) as Regle[];
}

function valeur(regle: Regle | undefined, cle: string): string | undefined {
  return regle?.headers.find((h) => h.key.toLowerCase() === cle.toLowerCase())?.value;
}

describe("cache du logo et des illustrations (PRF-05, D45 A)", () => {
  it("pose un Cache-Control sur /logo/* et sur /illustrations/*", async () => {
    const toutes = await regles();
    for (const dossier of ["/logo", "/illustrations"]) {
      const regle = toutes.find((r) => r.source === `${dossier}/:path*`);
      expect(regle, `aucune règle pour ${dossier}/*`).toBeDefined();
      expect(valeur(regle, "Cache-Control")).toBe(CACHE_IMAGES_DE_MARQUE);
    }
  });

  it("est une durée courte avec revalidation, jamais immutable ni supérieure à un jour de fraîcheur", () => {
    const maxAge = Number(/max-age=(\d+)/.exec(CACHE_IMAGES_DE_MARQUE)?.[1]);
    expect(maxAge, CACHE_IMAGES_DE_MARQUE).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(86_400);
    expect(CACHE_IMAGES_DE_MARQUE).toMatch(/stale-while-revalidate=\d+|must-revalidate/);
    expect(CACHE_IMAGES_DE_MARQUE).not.toMatch(/immutable/);
    expect(CACHE_IMAGES_DE_MARQUE).toMatch(/^public\b/);
  });

  it("ne promet pas une durée longue à des fichiers dont le nom n'est pas versionné", async () => {
    const racine = path.resolve(__dirname, "..", "public");
    const versionne = /-v\d+\.[a-z0-9]+$/i;
    const sansVersion = ["logo", "illustrations"].flatMap((d) =>
      readdirSync(path.join(racine, d)).filter((f) => !versionne.test(f)),
    );
    // Le dossier contient bien des fichiers non versionnés : la règle courte s'applique à eux tous.
    expect(sansVersion.length).toBeGreaterThan(5);
    const toutes = await regles();
    const longues = toutes.filter((r) => /^\/(logo|illustrations)\//.test(r.source))
      .filter((r) => /immutable|max-age=(\d{6,})/.test(valeur(r, "Cache-Control") ?? ""));
    expect(longues.map((r) => r.source)).toEqual([]);
  });

  it("ne touche ni aux en-têtes de sécurité ni à /auth/*", async () => {
    const toutes = await regles();
    expect(toutes.find((r) => r.source === "/(.*)")?.headers.some((h) => h.key === "Content-Security-Policy")).toBe(true);
    expect(valeur(toutes.find((r) => r.source === "/auth/:path*"), "Cache-Control")).toBe("no-store");
  });
});
