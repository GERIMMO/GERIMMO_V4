/**
 * D32 (fiche PUB-03) — les textes légaux ne décrivent plus l'offre ni le prix des agences.
 *
 * Réponse du dirigeant, 14/10/2026 : « A, une fois l'identité de l'éditeur fournie » ; relecture juridique
 * recommandée. La décision est donc différée tant que l'identité de l'éditeur manque (lib/editeur.ts).
 *
 * Pourquoi ce garde-fou : chaque retouche des conditions change leur version, et toute modification ensuite
 * demande un préavis d'un mois (conditions, article 16). Retirer les passages « agence » avant l'identité,
 * puis retoucher à son arrivée ou après la relecture, rouvrirait deux fois la version.
 *
 * Retrait : quand l'identité est fournie, `documentsIncomplets()` devient faux et ces tests s'ignorent d'eux-mêmes.
 * Le travail de rédaction déjà fait est conservé dans l'historique git (commits b02ccd9 et 46adcd1) ; il se
 * reprend en annulant le retour arrière qui les écarte.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CONDITIONS_DATE, CONDITIONS_VERSION, documentsIncomplets } from "@/lib/editeur";

/** La version publiée avant la décision D32. */
const VERSION_PUBLIEE = "2026-09-30";
const DATE_PUBLIEE = "30 septembre 2026";

const lire = (chemin: string) => readFileSync(resolve(__dirname, "..", chemin), "utf8");

describe.runIf(documentsIncomplets())("D32 en attente : l'identité de l'éditeur est incomplète", () => {
  it("la version et la date des conditions restent celles déjà publiées", () => {
    expect(CONDITIONS_VERSION).toBe(VERSION_PUBLIEE);
    expect(CONDITIONS_DATE).toBe(DATE_PUBLIEE);
  });

  it.each([
    ["conditions", "src/app/conditions/page.tsx"],
    ["mentions légales", "src/app/mentions-legales/page.tsx"],
    ["confidentialité", "src/app/confidentialite/page.tsx"],
  ])("la page « %s » garde la rédaction publiée (les passages « agence » ne sont pas encore retirés)", (_nom, chemin) => {
    expect(/agence/i.test(lire(chemin))).toBe(true);
  });

  it("le script des comptes de recette copie la même version des conditions", () => {
    const sql = lire("e2e/recette-production/preparer-comptes.sql");
    expect(sql).toContain(`v_version_cgu constant text := '${CONDITIONS_VERSION}';`);
  });
});
