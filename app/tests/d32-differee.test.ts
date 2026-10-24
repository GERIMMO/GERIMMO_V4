/**
 * D32 (fiche PUB-03) — les textes légaux ne décrivent plus l'offre ni le prix des agences.
 *
 * Réponse du dirigeant, 14/10/2026 : « A, une fois l'identité de l'éditeur fournie » ; relecture juridique
 * recommandée. La décision était donc différée tant que l'identité de l'éditeur manquait (lib/editeur.ts).
 *
 * Pourquoi ce garde-fou : chaque retouche des conditions change leur version, et toute modification ensuite
 * demande un préavis d'un mois (conditions, article 16). Retirer les passages « agence » avant l'identité,
 * puis retoucher à son arrivée ou après la relecture, rouvrait deux fois la version.
 *
 * Le 21/10, le dirigeant demande explicitement de réduire les seules mentions légales.
 * Cette page est donc exclue du gel.
 *
 * 24/10 (plan de conformité du 23/10, lots 3 et 4 ; décision du dirigeant du 23/10, point 11 : « Conditions V1
 * publiées dès que le code qui les rend vraies est en production ») : l'identité est saisie en base et la V1 des
 * conditions regroupe tous les changements en une seule version ; elle réalise D32 (offre aux seuls propriétaires qui
 * gèrent leurs biens, agences retirées) et paraît avec la confidentialité. La garde « confidentialité en attente »
 * n'a donc plus d'objet ; reste celle du script des comptes de recette, qui doit copier la version en vigueur.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CONDITIONS_VERSION } from "@/lib/editeur";

/** La version publiée avant la décision D32. */
const VERSION_PUBLIEE = "2026-09-30";

const lire = (chemin: string) => readFileSync(resolve(__dirname, "..", chemin), "utf8");
/** Le texte des conditions sans les commentaires du code : seul compte ce que la page affiche. */
const texteConditions = () =>
  lire("src/app/conditions/page.tsx")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("D32 réalisé par la V1 des conditions (24/10)", () => {
  it("la V1 est une nouvelle version, distincte de celle publiée avant D32", () => {
    expect(CONDITIONS_VERSION).not.toBe(VERSION_PUBLIEE);
  });

  it("les conditions ne décrivent plus l'offre ni le prix des agences", () => {
    const texte = texteConditions();
    expect(texte).not.toMatch(/agence/i);
    expect(texte).not.toMatch(/honoraires/i);
    expect(texte).not.toMatch(/mandant/i);
    expect(texte).not.toMatch(/sous mandat/i);
  });

  it("le script des comptes de recette copie la même version des conditions", () => {
    const sql = lire("e2e/recette-production/preparer-comptes.sql");
    expect(sql).toContain(`v_version_cgu constant text := '${CONDITIONS_VERSION}';`);
  });
});
