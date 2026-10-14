/**
 * Décision D29 B (fiche DES-A-11 du 13/10/2026) : l'adresse du propriétaire reste FACULTATIVE à l'inscription, mais sur
 * « Mes lots » vide, quand il manque de quoi le désigner comme bailleur, le bouton annonce le détour au lieu de
 * promettre « Créer mon premier bien ». Le bouton reprend la même règle que la porte de « Créer un lot ».
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { elementsManquantsDuBailleur } from "../src/lib/profil-bailleur";

const lire = (chemin: string) => readFileSync(resolve(__dirname, "..", chemin), "utf8");

describe("ce qui manque pour désigner le propriétaire comme bailleur", () => {
  const complet = { address_line1: "12 rue des Lilas", postal_code: "75011", city: "Paris", email_contact: "a@exemple.fr" };

  it("ne manque rien quand adresse, code postal, ville et e-mail sont là", () => {
    expect(elementsManquantsDuBailleur(complet)).toEqual([]);
  });

  it("nomme l'adresse dès qu'un de ses trois champs manque ou n'est que des espaces", () => {
    expect(elementsManquantsDuBailleur({ ...complet, address_line1: null })).toEqual(["votre adresse"]);
    expect(elementsManquantsDuBailleur({ ...complet, postal_code: "" })).toEqual(["votre adresse"]);
    expect(elementsManquantsDuBailleur({ ...complet, city: "   " })).toEqual(["votre adresse"]);
  });

  it("nomme l'e-mail de contact quand il manque", () => {
    expect(elementsManquantsDuBailleur({ ...complet, email_contact: null })).toEqual(["votre e-mail de contact"]);
  });

  it("nomme les deux, dans cet ordre, pour un profil absent ou vide", () => {
    expect(elementsManquantsDuBailleur(null)).toEqual(["votre adresse", "votre e-mail de contact"]);
    expect(elementsManquantsDuBailleur(undefined)).toEqual(["votre adresse", "votre e-mail de contact"]);
    expect(elementsManquantsDuBailleur({})).toEqual(["votre adresse", "votre e-mail de contact"]);
  });
});

describe("les écrans (D29 B)", () => {
  const parc = lire("src/app/agence/[orgId]/parc/page.tsx");
  const nouveau = lire("src/app/agence/[orgId]/parc/nouveau/page.tsx");
  const inscription = lire("src/app/inscription/formulaire-inscription.tsx");

  it("« Mes lots » vide propose « Compléter mon profil pour créer un bien » quand le profil est incomplet", () => {
    expect(parc).toContain("Compléter mon profil pour créer un bien");
    expect(parc).toContain("elementsManquantsDuBailleur");
    // Le détour passe par la même page que la porte de « Créer un lot », avec le même retour.
    expect(parc).toContain("/profil?retour=nouveau-lot");
  });

  it("garde « Créer mon premier bien » quand rien ne manque", () => {
    expect(parc).toContain("Créer mon premier bien");
  });

  it("« Créer un lot » partage la même règle que « Mes lots »", () => {
    expect(nouveau).toContain("elementsManquantsDuBailleur");
    expect(nouveau).not.toMatch(/!profil\?\.address_line1/);
  });

  it("l'inscription du propriétaire garde l'adresse facultative (inscription courte)", () => {
    for (const champ of ["Adresse postale (facultatif)", "Code postal (facultatif)", "Ville (facultatif)"]) {
      expect(inscription).toContain(champ);
    }
  });
});
