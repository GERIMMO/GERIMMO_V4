/**
 * Relevés du designer du 13/10/2026 (DES-A-15, DES-B-11), à 390 px. Ces défauts sont visuels : la preuve qui compte
 * est celle du navigateur (rapport du correcteur). Ce fichier garde ce qui se teste sans DOM, sur les sources.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const lire = (chemin: string) => readFileSync(resolve(__dirname, "..", chemin), "utf8");

describe("DES-A-15 : les options d'urgence du formulaire « Déclarer un incident » tiennent dans le <select> fermé", () => {
  const source = lire("src/app/agence/[orgId]/incidents/nouveau/formulaire-incident.tsx");
  const select = /<select\s+id="urgence"[\s\S]*?<\/select>/.exec(source)?.[0] ?? "";
  const libelles = [...select.matchAll(/<option value="[^"]+">([^<]+)<\/option>/g)].map((m) => m[1]);

  // Mesuré à 390 px : 270 px utiles dans le champ fermé, environ 7,8 px par caractère. Un <select> ne retourne pas à la ligne.
  const BUDGET_CARACTERES = 32;

  it("le select a ses deux options", () => {
    expect(libelles).toEqual(["Normal — sous quelques jours", "Urgent — dégât en cours"]);
  });

  it.each(libelles)("« %s » reste sous le budget de caractères", (libelle) => {
    expect(libelle.length).toBeLessThanOrEqual(BUDGET_CARACTERES);
  });

  it("le critère complet de l'urgence passe sous le champ, relié au select", () => {
    expect(select).toContain('aria-describedby="urgence-aide"');
    expect(source).toContain('id="urgence-aide"');
    expect(source).toContain("Urgent : un dégât est en cours ou le logement est inutilisable.");
  });
});

describe("DES-B-11 : le bandeau « Habilitation perdue » du Relais forme sa propre ligne", () => {
  const source = lire("src/app/admin/relais/vacances.tsx");
  const bandeau = /<strong className="([^"]*)">([^<]*Habilitation perdue[^<]*)<\/strong>/.exec(source);

  it("est un bloc (display: block) sous « Responsable : … », avec une marge haute", () => {
    expect(bandeau).not.toBeNull();
    const classes = bandeau![1].split(" ");
    expect(classes).toContain("err");
    expect(classes).toContain("block");
    expect(classes).toContain("mt-1");
  });

  it("ne commence plus par un tiret cadratin posé contre l'adresse", () => {
    expect(bandeau![2]).toBe("Habilitation perdue : tâches bloquées");
  });
});
