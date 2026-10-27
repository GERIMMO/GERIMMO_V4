/**
 * Icônes du site (audit #264, TRV-04) : l'onglet et l'écran d'accueil chargeaient le logo source, un PNG de
 * 2016×1594 et 285 Ko, à chaque premier chargement, pour l'afficher en 16 à 180 pixels. Les icônes sont le même
 * logo réduit, aux mêmes proportions, et la métadonnée ne pointe plus vers le logo plein format.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHARTE_GERIMMO } from "../src/lib/charte-gerimmo";

const racine = path.resolve(__dirname, "..");

/** Largeur et hauteur lues dans l'en-tête IHDR du PNG. */
function dimensions(fichier: string) {
  const octets = readFileSync(fichier);
  expect(octets.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { largeur: octets.readUInt32BE(16), hauteur: octets.readUInt32BE(20) };
}

describe("icônes du site", () => {
  it("la métadonnée du layout racine sert les icônes réduites, jamais le logo plein format", () => {
    const layout = readFileSync(path.join(racine, "src/app/layout.tsx"), "utf8");
    const icones = /icons:\s*\{([\s\S]*?)\n  \},/.exec(layout)?.[1] ?? "";
    expect(icones).toContain("CHARTE_GERIMMO.icone");
    expect(icones).toContain("CHARTE_GERIMMO.iconeEcran");
    expect(icones).not.toMatch(/CHARTE_GERIMMO\.logo\b/);
  });

  it.each([
    [CHARTE_GERIMMO.icone, CHARTE_GERIMMO.iconeTaille],
    [CHARTE_GERIMMO.iconeEcran, CHARTE_GERIMMO.iconeEcranTaille],
  ])("%s pèse moins de 20 Ko, mesure ce qu'annonce sa taille et garde les proportions du logo", (url, taille) => {
    const fichier = path.join(racine, "public", url);
    expect(statSync(fichier).size).toBeLessThan(20 * 1024);
    const { largeur, hauteur } = dimensions(fichier);
    expect(`${largeur}x${hauteur}`).toBe(taille);
    expect(Math.abs(largeur / hauteur - CHARTE_GERIMMO.logoLargeur / CHARTE_GERIMMO.logoHauteur)).toBeLessThan(0.02);
  });
});
