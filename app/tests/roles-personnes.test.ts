/**
 * Rôles déduits des données et recherche de personnes.
 *
 * La fiche n'a pas de rôle en propre : il vient des détentions, des baux et des
 * mandats. La liste doit dire qui est qui — et se chercher sans se soucier des
 * accents ni de l'ordre des mots.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { correspond, normaliser, rolesDePersonne, sansRoleEnCours } from "../src/lib/roles-personnes";
import { AnnuaireProprietaire } from "../src/app/agence/[orgId]/personnes/annuaire-proprietaire";

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

describe("sansRoleEnCours (audit #264, FL-09)", () => {
  // Un bail seulement en préparation est nommé dans la liste mais ne fait pas
  // un rôle en cours : la fiche reste dans « Sans bail en cours ».
  it("vaut pour une fiche sans rôle ou dont tous les rôles attendent un bail en préparation", () => {
    expect(sansRoleEnCours([])).toBe(true);
    expect(sansRoleEnCours([{ libelle: "Locataire · bail en préparation" }])).toBe(true);
    expect(sansRoleEnCours([{ libelle: "Locataire · bail en préparation" }, { libelle: "Garant · bail en préparation" }])).toBe(true);
  });

  it("ne vaut plus dès qu'un rôle en cours s'ajoute", () => {
    expect(sansRoleEnCours([{ libelle: "Locataire" }])).toBe(false);
    expect(sansRoleEnCours([{ libelle: "Propriétaire" }, { libelle: "Locataire · bail en préparation" }])).toBe(false);
    expect(sansRoleEnCours([{ libelle: "Propriétaire mandant · sans mandat" }])).toBe(false);
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

describe("filtres de la liste « Locataires & garants » (audit #264, FL-09)", () => {
  // La fiche d'un bail en préparation était nommée « Locataire · bail en
  // préparation » mais ne tombait dans aucun filtre de rôle : les compteurs ne
  // se recoupaient plus et elle n'apparaissait que sous « Toutes les fiches ».
  const fiche = (id: string, ...libelles: string[]) => ({
    id, nom: id, prenom: null, email: null, telephone: null,
    roles: libelles.map((libelle) => ({ libelle, classe: "", puce: "" })),
  });
  const compteurs = (html: string) => Object.fromEntries(
    [...html.matchAll(/<button[^>]*aria-pressed[^>]*>(.*?)<\/button>/g)]
      .map(([, contenu]) => /^(.*?)(\d+)$/.exec(contenu.replace(/<[^>]+>/g, ""))!)
      .map(([, libelle, nombre]) => [libelle, Number(nombre)]),
  );

  it("range la fiche d'un bail en préparation sous « Sans bail en cours »", () => {
    const html = renderToStaticMarkup(createElement(AnnuaireProprietaire, {
      orgId: "o", listeIllisible: false, personnes: [
        fiche("Alice", "Locataire"),
        fiche("Chloé", "Locataire · bail en préparation"),
        fiche("Paul", "Garant · bail en préparation"),
        fiche("Lucas"),
        fiche("Claire", "Propriétaire", "Locataire · bail en préparation"),
      ],
    }));
    expect(compteurs(html)).toEqual({
      "Toutes les fiches": 5, Locataires: 1, Garants: 0, Propriétaires: 1, "Sans bail en cours": 3,
    });
  });
});
