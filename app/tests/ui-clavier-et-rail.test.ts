/**
 * Audit du 13/10/2026 (designers A et B) — le clavier et le rail de menu des tablettes.
 *
 * Ces défauts sont visuels ou clavier : la preuve qui compte est celle du
 * navigateur (rapport du correcteur). Ce fichier garde ce qui se teste sans DOM :
 *  · DES-A-09 : la règle qui boucle Tab dans le tiroir « Menu » (fonction pure) ;
 *  · DES-A-14 : les initiales mises à la place du nom tronqué dans le rail ;
 *  · DES-A-04 : la liste de définitions des chiffres clés d'un bien est bien formée ;
 *  · DES-B-01, ARC-05 : les cartes de l'artisan ne poussent plus la page à 448 px dans 390 ;
 *  · DES-A-01, DES-B-02, DES-A-13, DES-A-05 : le contrat de la feuille de style
 *    (le texte de la règle, pas son rendu).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { initialesMarque } from "../src/lib/marque-organisation";
import { cibleDeTabulation } from "../src/lib/piege-focus";
import { MarqueOrganisation } from "../src/components/marque-organisation";
import { ChiffresBien } from "../src/app/agence/[orgId]/parc/[bienId]/chiffres-bien";

const css = (nom: string) => readFileSync(path.join(__dirname, "../src/app", nom), "utf8");

describe("cibleDeTabulation — le piège à focus du tiroir « Menu » (DES-A-09)", () => {
  const liste = ["fermer", "organisation", "accueil", "aide"];

  it("ne touche à rien quand Tab reste au milieu : le navigateur avance seul", () => {
    expect(cibleDeTabulation(liste, "organisation", false)).toBeNull();
    expect(cibleDeTabulation(liste, "accueil", true)).toBeNull();
  });

  it("Tab sur le dernier contrôle revient au premier (le focus ne sort pas du tiroir)", () => {
    expect(cibleDeTabulation(liste, "aide", false)).toBe("fermer");
  });

  it("Maj+Tab sur le premier contrôle va au dernier", () => {
    expect(cibleDeTabulation(liste, "fermer", true)).toBe("aide");
  });

  it("si le focus est hors du tiroir (resté sur le bouton « Menu »), Tab entre par le premier, Maj+Tab par le dernier", () => {
    expect(cibleDeTabulation(liste, "bouton-menu", false)).toBe("fermer");
    expect(cibleDeTabulation(liste, "bouton-menu", true)).toBe("aide");
    expect(cibleDeTabulation(liste, null, false)).toBe("fermer");
  });

  it("un seul contrôle : le focus y reste dans les deux sens", () => {
    expect(cibleDeTabulation(["fermer"], "fermer", false)).toBe("fermer");
    expect(cibleDeTabulation(["fermer"], "fermer", true)).toBe("fermer");
  });

  it("aucun contrôle : rien à viser", () => {
    expect(cibleDeTabulation([], "x", false)).toBeNull();
  });
});

describe("initialesMarque — la cellule étroite du rail (DES-A-14)", () => {
  it("prend la première lettre des deux premiers mots", () => {
    expect(initialesMarque("Parc de Claire Moreau")).toBe("PD");
    expect(initialesMarque("Agence Alpha")).toBe("AA");
    expect(initialesMarque("Gerimmo")).toBe("G");
  });

  it("garde l'accent et ignore la ponctuation qui précède la lettre", () => {
    expect(initialesMarque("Éloïse Durand-Lévêque")).toBe("ÉD");
    expect(initialesMarque("[TEST] Parc d'Éloïse")).toBe("TP");
    expect(initialesMarque("  & Cie  ")).toBe("C");
  });

  it("ne renvoie rien d'un nom vide ou sans lettre", () => {
    expect(initialesMarque("")).toBe("");
    expect(initialesMarque(" - & ")).toBe("");
  });

  it("MarqueOrganisation les pose en data-initiales, nom entier en infobulle", () => {
    const html = renderToStaticMarkup(createElement(MarqueOrganisation, { marque: { name: "Parc de Claire Moreau" } }));
    expect(html).toContain('data-initiales="PD"');
    expect(html).toContain('title="Parc de Claire Moreau"');
    expect(html).toContain(">Parc de Claire Moreau<");
  });

  it("pas d'initiales quand c'est le logo Gerimmo qui s'affiche", () => {
    const html = renderToStaticMarkup(createElement(MarqueOrganisation, { marque: null }));
    expect(html).not.toContain("data-initiales");
  });
});

describe("ChiffresBien — la liste de définitions de la fiche d'un bien (DES-A-04)", () => {
  const html = renderToStaticMarkup(
    createElement(ChiffresBien, {
      chiffres: [
        { icone: "cle", label: "Lots actifs", valeur: "2" },
        { icone: "doc", label: "Diagnostics du bien", valeur: "0 déposé" },
      ],
    })
  );

  it("un <dl> dont chaque groupe <div> ne contient que <dt> puis <dd> (l'icône est dans le <dt>)", () => {
    expect(html).toMatch(
      /^<dl class="bien-visuel-chiffres">(<div><dt><svg[^>]*>.*?<\/svg>[^<]+<\/dt><dd>[^<]+<\/dd><\/div>){2}<\/dl>$/
    );
  });

  it("garde les libellés et les valeurs", () => {
    expect(html).toContain("Lots actifs</dt><dd>2</dd>");
    expect(html).toContain("Diagnostics du bien</dt><dd>0 déposé</dd>");
  });

  it("l'icône est décorative : aria-hidden, elle ne s'ajoute pas au nom du terme", () => {
    expect(html.match(/<svg[^>]*aria-hidden="true"/g)).toHaveLength(2);
  });
});

describe("feuilles de style — barres fixes, rail de tablette", () => {
  const globals = css("globals.css");
  const prestige = css("prestige.css");

  it("DES-A-01 : la racine réserve la barre basse à l'espace agence/propriétaire/locataire pour le focus", () => {
    const bloc = /@media \(max-width: 640px\) \{[\s\S]*?html:has\(\.coquille-basse\)\s*\{\s*scroll-padding-bottom:\s*calc\((\d+)px \+ env\(safe-area-inset-bottom, 0px\)\)/.exec(globals);
    expect(bloc, "règle html:has(.coquille-basse) dans le gabarit téléphone").not.toBeNull();
    // la barre fait 56 px d'onglets + 1 px de filet
    expect(Number(bloc![1])).toBeGreaterThanOrEqual(57);
  });

  it("DES-B-02 : même réserve pour la barre d'onglets de l'artisan, jusqu'à 999 px", () => {
    const bloc = /@media \(max-width: 999px\) \{\s*html:has\(\.artisan-navigation\)\s*\{\s*scroll-padding-bottom:\s*calc\((\d+)px \+ env\(safe-area-inset-bottom, 0px\)\)/.exec(globals);
    expect(bloc, "règle html:has(.artisan-navigation)").not.toBeNull();
    // la barre fait 64 px (min-h-16)
    expect(Number(bloc![1])).toBeGreaterThanOrEqual(64);
  });

  it("DES-A-13 : le rail du propriétaire n'efface plus les libellés des entrées", () => {
    const rail = /@media \(max-width: 1023px\) \{([\s\S]*?)\n\}/.exec(globals.slice(globals.indexOf("Tablette : le rail")))![1];
    // aucune règle de masquage ne vise plus `.lib` en bloc : seul le titre de groupe reste caché ailleurs
    expect(rail).not.toMatch(/\.coquille-menu \.lib[\s,][^{]*\{[^}]*display:\s*none/);
    expect(rail).toMatch(/\.coquille-late \.coquille-menu a \.lib\s*\{[^}]*display:\s*block/);
    expect(rail).toMatch(/\.coquille-late \.coquille-menu a \.lib\s*\{[^}]*font-size:\s*10\.5px/);
    expect(rail).toMatch(/\.coquille-late \.coquille-menu a\s*\{[^}]*flex-direction:\s*column/);
  });

  it("DES-A-05 : les libellés du rail locataire ne descendent plus sous 10,5 px", () => {
    const bande = /@media \(min-width: 641px\) and \(max-width: 860px\) \{\s*\.loc-app[\s\S]*?\n\}/.exec(globals)![0];
    const taille = /\.loc-menu \.lib\s*\{[^}]*font-size:\s*([\d.]+)px/.exec(bande);
    expect(taille).not.toBeNull();
    expect(Number(taille![1])).toBeGreaterThanOrEqual(10.5);
  });

  it("DES-B-01 / ARC-05 : la piste des listes de cartes de l'artisan et de la page d'un devis ne s'élargit plus avec un nom long", () => {
    const portail = readFileSync(path.join(__dirname, "../src/app/artisan/portail-artisan.module.css"), "utf8");
    // la règle de base, avant le @media (min-width: 700px) qui passe la liste à deux colonnes
    const base = portail.slice(0, portail.indexOf("@media"));
    expect(base).toMatch(/\.content :global\(\.artisan-liste\) \{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    const devis = readFileSync(path.join(__dirname, "../src/app/artisan/devis/[sollicitationId]/devis.module.css"), "utf8");
    expect(devis).toMatch(/^\.page \{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/m);
  });

  it("DES-A-04 : les chiffres clés d'un bien ne sont plus en flex à deux étages (l'icône est dans le <dt>)", () => {
    expect(globals).not.toMatch(/\.bien-visuel-chiffres > div \{[^}]*display:\s*flex/);
    expect(globals).toMatch(/\.bien-visuel-chiffres dt \{[^}]*position:\s*relative/);
    expect(globals).toMatch(/\.bien-visuel-chiffres svg \{[^}]*position:\s*absolute/);
  });

  it("rails propriétaire et locataire : même largeur (76 px) et mêmes marges de libellé", () => {
    expect(globals).toMatch(/@media \(max-width: 1023px\) \{\s*:root \{ --largeur-late: 76px; \}/);
    expect(prestige).toMatch(/\.gerimmo-prestige \.coquille-late \.coquille-menu a \{ padding: 9px 2px; \}/);
    expect(prestige).toMatch(/\.gerimmo-prestige \.loc-late \.loc-menu a \{ padding: 9px 2px; \}/);
  });
});
