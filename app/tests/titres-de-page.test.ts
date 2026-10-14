/**
 * Audit du 13/10/2026, DES-B-07 (et DES-B-05 point 5) : les onglets de l'espace artisan et de la supervision portaient
 * quatre suffixes différents (« — Gerimmo », « — Supervision », « — Console Gerimmo », « — Espace artisan »), un
 * « — Artisan » isolé, et trois écrans sans titre propre.
 *
 * Règle retenue : chaque segment (app/artisan, app/admin) déclare UN gabarit `%s — Gerimmo` ; les pages ne donnent que
 * le nom de l'écran. Deux pièges que ce test garde :
 *  · le suffixe doublé : une page qui garde « — Gerimmo » sous le gabarit afficherait « X — Gerimmo — Gerimmo » ;
 *  · le gabarit d'un layout ne s'applique PAS à la page du même segment (doc Next, `title.template`, et
 *    `accumulateMetadata`, qui saute la paire feuille layout/page) : app/artisan/page.tsx et app/admin/page.tsx
 *    gardent donc leur suffixe écrit en toutes lettres.
 *
 * Le test lit le texte des fichiers et applique le gabarit comme Next le fait (`template.replace("%s", titre)`) : un
 * import des pages tirerait toute la couche serveur (Supabase, en-têtes) pour lire une chaîne.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const racine = path.join(__dirname, "../src/app");
const SUFFIXE = " — Gerimmo";

function fichiers(dossier: string, nom: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = path.join(dossier, e.name);
    if (e.isDirectory()) return fichiers(chemin, nom);
    return e.name === nom ? [chemin] : [];
  });
}

/** Le premier `title:` après la déclaration des métadonnées, `${…}` remplacé par une ellipse. */
function titreDeclare(source: string): string | null {
  const debut = Math.min(
    ...["export const metadata", "export async function generateMetadata", "export function generateMetadata"]
      .map((m) => source.indexOf(m))
      .filter((i) => i >= 0),
  );
  if (!Number.isFinite(debut)) return null;
  const m = source.slice(debut).match(/\btitle\s*:\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)/);
  const brut = m?.[1] ?? m?.[2] ?? m?.[3];
  return brut === undefined ? null : brut.replace(/\$\{[^}]*\}/g, "…");
}

const segments = [
  { nom: "artisan", dossier: path.join(racine, "artisan"), defaut: "Espace artisan" },
  { nom: "admin (supervision)", dossier: path.join(racine, "admin"), defaut: "Supervision" },
];

describe.each(segments)("titres de page — $nom", ({ dossier, defaut }) => {
  const layout = readFileSync(path.join(dossier, "layout.tsx"), "utf8");
  const pages = fichiers(dossier, "page.tsx");

  it("le layout déclare le gabarit « %s — Gerimmo » et un titre par défaut qui porte le même suffixe", () => {
    expect(layout).toContain(`template: "%s${SUFFIXE}"`);
    expect(layout).toContain(`default: "${defaut}${SUFFIXE}"`);
  });

  it("le test voit bien les pages du segment (garde-fou contre un parcours vide)", () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it.each(pages.map((p) => [path.relative(racine, p), p]))("%s : un titre propre, et un seul suffixe une fois résolu", (_nom, page) => {
    const titre = titreDeclare(readFileSync(page, "utf8"));
    expect(titre, "la page doit déclarer son titre (metadata ou generateMetadata)").toBeTruthy();

    // Next n'applique pas le gabarit d'un layout à la page de son propre segment.
    const memeSegment = path.dirname(page) === dossier;
    const resolu = memeSegment ? (titre as string) : (layout.match(/template: "([^"]*)"/)?.[1] ?? "%s").replace("%s", titre as string);

    if (!memeSegment) {
      expect(titre, "le suffixe est celui du gabarit : la page ne le répète pas").not.toContain(" — ");
    }
    expect(resolu.endsWith(SUFFIXE)).toBe(true);
    expect(resolu.split(" — ")).toHaveLength(2);
  });
});
