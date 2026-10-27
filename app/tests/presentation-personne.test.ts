import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PresentationPersonne } from "../src/app/agence/[orgId]/personnes/[personId]/presentation-personne";
import { ApercuDocumentPersonne } from "../src/app/agence/[orgId]/personnes/[personId]/apercu-document-personne";

const personne = { nom: "Moreau", prenom: "Claire", qualite: "Personne physique", email: "claire@example.test", telephone: "+33 6 01 02 03 04", address_line1: "4 rue Exemple", postal_code: "75001", city: "Paris", date_naissance: "1980-04-10", commune_naissance: "Lyon" };
const options = { personne, roles: [{ libelle: "Locataire", classe: "", puce: "" }], sansRole: "Sans bail en cours", retour: { href: "/espace/org/personnes", libelle: "Locataires & garants" }, lienModifier: "/espace/org/personnes/personne?modifier=1#identite", edition: createElement("button", null, "Modifier la fiche") };
const rendre = (props: Partial<Parameters<typeof PresentationPersonne>[0]> = {}) => renderToStaticMarkup(createElement(PresentationPersonne, { ...options, ...props }));

describe("présentation de la personne", () => {
  it("présente l’identité et les contacts avant l’action de modification", () => {
    const html = rendre();
    expect(html).toContain('id="nom-personne">Moreau Claire</h1>'); expect(html).toContain("MC</span>");
    expect(html).toContain('href="mailto:claire@example.test"'); expect(html).toContain('href="tel:+33601020304"');
    expect(html).toContain("4 rue Exemple, 75001 Paris"); expect(html).toContain("10/04/1980"); expect(html).toContain("Lyon");
    expect(html.indexOf("</dl>")).toBeLessThan(html.indexOf("Modifier la fiche"));
  });
  it("rend les coordonnées absentes explicites avec un accès exact à l’édition", () => {
    const html = rendre({ personne: { ...personne, email: null, telephone: null, address_line1: null, postal_code: null, city: null, date_naissance: null, commune_naissance: null } });
    expect(html).toContain("Ajouter un email"); expect(html).toContain("Ajouter une adresse"); expect(html).toContain("Compléter l’état civil");
    expect(html).toContain('href="/espace/org/personnes/personne?modifier=1#identite"');
    expect(html).not.toContain("mailto:"); expect(html).not.toContain("tel:");
  });
  it("ne présente pas une adresse partielle comme complète", () => {
    expect(rendre({ personne: { ...personne, postal_code: null } })).toContain("Compléter l’adresse");
    expect(rendre()).not.toContain("Compléter l’adresse");
  });
  it("présente une SCI avec sa qualité sans demander de naissance", () => {
    const html = rendre({ personne: { ...personne, nom: "SCI Les Tilleuls", prenom: null, qualite: "SCI familiale", date_naissance: null, commune_naissance: null } });
    expect(html).toContain("SCI Les Tilleuls"); expect(html).toContain("SCI familiale"); expect(html).not.toContain("État civil"); expect(html).not.toContain("naissance");
  });
  it("n’invente pas la qualité d’une fiche sans prénom", () => {
    const html = rendre({ personne: { ...personne, prenom: null, qualite: null } });
    expect(html).toContain("Fiche personne"); expect(html).not.toContain("Personne morale");
  });
  it("une erreur de lecture ne devient pas une absence de bail", () => {
    const html = rendre({ roles: [], relationsIndisponibles: true });
    expect(html).toContain("Rattachements à vérifier"); expect(html).not.toContain("Sans bail en cours");
  });
  it("distingue un bail en préparation d’une location active", () => {
    const html = rendre({ roles: [{ libelle: "Locataire · bail en préparation", classe: "", puce: "" }] });
    expect(html).toContain("bail en préparation"); expect(html).not.toContain("Sans bail en cours");
  });
  it("propose un aperçu de justificatif sur place", () => {
    const html = renderToStaticMarkup(createElement(ApercuDocumentPersonne, { fichier: "/espace/org/documents/doc/fichier", titre: "Identité" }));
    expect(html).toContain('aria-haspopup="dialog"'); expect(html).toContain("Aperçu"); expect(html).not.toContain('target="_blank"'); expect(html).not.toContain('href="');
  });
});
