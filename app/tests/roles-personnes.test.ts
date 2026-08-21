/**
 * Rôles déduits des données et recherche de personnes.
 *
 * La fiche n'a pas de rôle en propre : il vient des détentions, des baux et des
 * mandats. La liste doit dire qui est qui — et se chercher sans se soucier des
 * accents ni de l'ordre des mots.
 */
import { describe, expect, it } from "vitest";
import { correspond, normaliser, rolesDePersonne } from "../src/lib/roles-personnes";

const vide = new Set<string>();
const liens = (l: Partial<Record<keyof Parameters<typeof rolesDePersonne>[1], string[]>>) => ({
  proprietaires: new Set(l.proprietaires ?? []),
  mandants: new Set(l.mandants ?? []),
  locataires: new Set(l.locataires ?? []),
  garants: new Set(l.garants ?? []),
});

describe("rolesDePersonne", () => {
  it("distingue le mandant sous mandat du mandant sans mandat (recette 21/08 : jamais « Propriétaire » nu)", () => {
    // Le mandat est l'information commerciale : client ou prospect.
    const l = liens({ proprietaires: ["a", "b"], mandants: ["a"] });
    expect(rolesDePersonne("a", l)[0].libelle).toBe("Propriétaire mandant");
    expect(rolesDePersonne("b", l)[0].libelle).toBe("Propriétaire mandant · sans mandat");
  });

  it("un mandant est propriétaire même sans détention listée", () => {
    // Le mandat prouve la propriété (RM-5.1.1) : ne pas l'afficher serait faux.
    const l = liens({ mandants: ["a"] });
    expect(rolesDePersonne("a", l)[0].libelle).toBe("Propriétaire mandant");
  });

  it("cumule les rôles dans l'ordre possède / occupe / garantit", () => {
    const l = liens({ proprietaires: ["a"], locataires: ["a"], garants: ["a"] });
    expect(rolesDePersonne("a", l).map((r) => r.libelle)).toEqual([
      "Propriétaire mandant · sans mandat",
      "Locataire",
      "Garant",
    ]);
  });

  it("rend une liste vide pour une fiche sans lien", () => {
    expect(
      rolesDePersonne("x", { proprietaires: vide, mandants: vide, locataires: vide, garants: vide })
    ).toEqual([]);
  });
});

describe("recherche", () => {
  it("ignore les accents et la casse", () => {
    expect(normaliser("Hélène")).toBe("helene");
    expect(correspond("helene", "BERTRAND", "Hélène")).toBe(true);
  });

  it("trouve chaque mot, dans n'importe quel ordre", () => {
    expect(correspond("sabine leroy", "LEROY", "Sabine")).toBe(true);
    expect(correspond("leroy sab", "LEROY", "Sabine")).toBe(true);
    expect(correspond("leroy marc", "LEROY", "Sabine")).toBe(false);
  });

  it("cherche aussi dans l'email", () => {
    expect(correspond("dasilva", "PETIT", "Luc", "luc@dasilva-conseil.fr")).toBe(true);
  });

  it("une recherche vide laisse tout passer", () => {
    expect(correspond("", "LEROY")).toBe(true);
    expect(correspond("   ", "LEROY")).toBe(true);
  });
});
