/**
 * L'ÉCRAN DE RESTITUTION DU DÉPÔT DIT CE QUI EST — audit palier 1 du 22/11/2026, P1-09 et P1-12 (parties sans texte
 * officiel).
 *
 * Deux défauts d'honnêteté de l'écran, relevés par l'audit :
 *  · la confirmation de « Finaliser » promettait qu'une correction « passera par un décompte rectificatif envoyé au
 *    locataire » : aucun geste de Gerimmo n'en produit (une seule restitution par bail) ;
 *  · les durées de vie proposées à la saisie d'une retenue pouvaient passer pour une grille de vétusté : Gerimmo n'en
 *    annexe aucune au bail.
 *
 * Ces garde-fous vivent dans le JSX : on lit la source, comme le fait déjà tests/restitution-impayes.test.ts, pour
 * qu'un retour en arrière se voie. L'écran réel est tenu par e2e/restitution-ecran-honnete.spec.ts.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/agence/[orgId]/baux/[bailId]/formulaire-restitution.tsx", "utf8");
const texte = source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "").replace(/&apos;/g, "'").replace(/\s+/g, " ");

describe("écran de restitution du dépôt : ce qui est promis existe", () => {
  it("la confirmation de « Finaliser » ne promet plus de décompte rectificatif : elle dit qu'il n'y en a pas", () => {
    const bouton = texte.slice(texte.indexOf("function BoutonFinaliser"));
    expect(bouton).toContain("Gerimmo ne produit pas de décompte rectificatif");
    expect(bouton).toContain("relisez les montants avant de finaliser");
    expect(bouton).toContain("Une correction ultérieure se ferait par un écrit au locataire, hors de Gerimmo.");
    expect(texte).not.toContain("passera par un décompte rectificatif");
    expect(texte).not.toMatch(/rectificatif envoyé au locataire/);
    expect(bouton).toContain("data-decompte-fige");
  });

  it("aucune fonction de l'application ne produit de décompte rectificatif (la phrase reste donc vraie)", () => {
    const actions = readFileSync("src/app/actions/restitution.ts", "utf8");
    expect(actions).not.toMatch(/rectificatif/i);
  });

  it("les durées de vie proposées sont dites indicatives, sans grille convenue avec le locataire", () => {
    expect(texte).toContain("data-bareme-indicatif");
    expect(texte).toContain("Les durées de vie proposées dans la liste sont indicatives : c'est vous qui les retenez.");
    expect(texte).toContain("Elles ne viennent d'aucune grille de vétusté convenue avec le locataire.");
    // La liste reste une aide à la saisie, offerte par le champ « Durée de vie ».
    expect(source).toContain('list="bareme-vetuste"');
  });

  it("le mot « réglementaire » ne s'affiche nulle part sur cet écran", () => {
    expect(texte).not.toMatch(/réglementaire/i);
  });
});
