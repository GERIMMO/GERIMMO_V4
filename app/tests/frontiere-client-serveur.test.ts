/**
 * UNE PAGE SERVEUR N'APPELLE PAS UNE FONCTION D'UN MODULE « CLIENT » (audit palier 1 du 22/11/2026, lot 15).
 *
 * Le défaut, trouvé par un parcours navigateur : la page des paramètres du superviseur appelait `envoisOuverts()`,
 * exportée par le composant « client » du panneau. Next refuse (« Attempted to call … from the server but … is on the
 * client ») et la page entière tombe en erreur. Aucun test unitaire ne le voyait : hors de Next, l'appel fonctionne.
 *
 * La règle tenue ici, pour chaque page, mise en page et route du serveur : d'un module « use client », on n'importe
 * que des composants (nom en majuscule, rendus par React) et des types. Une fonction ou une constante partagée vit
 * dans un module sans « use client ».
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = resolve(__dirname, "..");
const SRC = join(RACINE, "src");

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : /\.(ts|tsx)$/.test(nom) ? [chemin] : [];
  });
}
const estClient = (source: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(source);

function resoudre(depuis: string, specifieur: string): string | null {
  const base = specifieur.startsWith("@/") ? join(SRC, specifieur.slice(2)) : specifieur.startsWith(".") ? resolve(dirname(depuis), specifieur) : null;
  if (!base) return null;
  for (const candidat of [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) if (existsSync(candidat)) return candidat;
  return null;
}

/** Les valeurs (pas les types) importées par nom : `import { a, B as C, type T } from "…"`. */
function valeursImportees(source: string): { specifieur: string; noms: string[] }[] {
  const imports: { specifieur: string; noms: string[] }[] = [];
  for (const m of source.matchAll(/^import\s+(type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/gm)) {
    if (m[1]) continue;
    const noms = m[2].split(",").map((n) => n.trim()).filter((n) => n && !n.startsWith("type ")).map((n) => n.split(/\s+as\s+/)[0].trim());
    imports.push({ specifieur: m[3], noms });
  }
  return imports;
}

describe("frontière entre le serveur et les composants « client »", () => {
  it("une page, une mise en page ou une route du serveur n'importe d'un module « client » que des composants et des types", () => {
    const serveur = fichiers(join(SRC, "app")).filter((f) => /[\\/](page|layout|route|loading|not-found|default)\.tsx?$/.test(f));
    expect(serveur.length).toBeGreaterThan(100);
    const fautes: string[] = [];
    for (const fichier of serveur) {
      const source = readFileSync(fichier, "utf8");
      if (estClient(source)) continue;
      for (const { specifieur, noms } of valeursImportees(source)) {
        const cible = resoudre(fichier, specifieur);
        if (!cible || !estClient(readFileSync(cible, "utf8"))) continue;
        for (const nom of noms) if (!/^[A-Z]/.test(nom)) fautes.push(`${fichier.slice(RACINE.length + 1)} importe « ${nom} » de ${specifieur} (module client)`);
      }
    }
    expect(fautes).toEqual([]);
  });

  it("le contrôle reconnaît bien un module client et lit bien les imports", () => {
    expect(estClient('"use client";\nimport x from "y";')).toBe(true);
    expect(estClient("// commentaire\n'use client'\n")).toBe(true);
    expect(estClient('import x from "y";\n"use client";')).toBe(false);
    expect(valeursImportees('import { a, B as C, type T } from "@/m";\nimport type { U } from "./n";\nimport D, { e } from "./o";'))
      .toEqual([{ specifieur: "@/m", noms: ["a", "B"] }, { specifieur: "./o", noms: ["e"] }]);
    // Le panneau des envois automatiques est bien un module client : c'est lui que la page ne doit pas « appeler ».
    expect(estClient(readFileSync(join(SRC, "app/admin/parametres/envois-automatiques.tsx"), "utf8"))).toBe(true);
    expect(estClient(readFileSync(join(SRC, "lib/envois-suspendus.ts"), "utf8"))).toBe(false);
  });
});
