import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LignesDevis } from "@/app/artisan/lignes-devis";

const ligne = (prix: string, tva = "", quantite = "1") => ({ code: "", libelle: "Réparation fictive", prix, quantite, tva });
const rendu = (lignes = [ligne("65")], active = true) => renderToStaticMarkup(createElement(LignesDevis, { afficherHtIncomplet:active, saisieInitiale:lignes })).replace(/<!--.*?-->/g, "").replace(/\u00a0|\u202f/g," ");

describe("A05 : montants lisibles sans inventer une TVA", () => {
  it("affiche 65 € HT sans TVA et conserve le taux vide dans la saisie", () => {
    const h=rendu(); expect(h).toContain("Total HT : 65,00 €"); expect(h).toContain("Total TTC : À compléter"); expect(h).not.toContain("Total TTC : 0,00"); expect(h).toContain("Choisissez la TVA"); expect(h).toContain("&quot;tva&quot;:&quot;&quot;");
  });
  it.each([["0","65,00"],["210","66,37"],["550","68,58"],["1000","71,50"],["2000","78,00"]])("conserve le calcul existant au taux %s", (taux, attendu) => {
    expect(rendu([ligne("65",taux)])).toContain(`Total TTC : ${attendu} €`);
  });
  it("affiche le HT de plusieurs lignes même si une TVA manque", () => {
    const h=rendu([ligne("65","2000","2"),ligne("12,34","","1,5")]); expect(h).toContain("Total HT : 148,51 €"); expect(h).toContain("Total TTC : À compléter");
  });
  it("ne remplace pas un prix incorrect par zéro", () => {
    const h=rendu([ligne("abc")]); expect(h).toContain("Total HT : À compléter"); expect(h).toContain("Corrigez les quantités ou prix");
  });
  it("conserve les arrondis exacts au demi-centime", () => {
    const h=rendu([ligne("0,01","2000","1,5")]); expect(h).toContain("Total HT : 0,02 €"); expect(h).toContain("Total TTC : 0,02 €");
  });
  it("ne modifie pas la présentation des autres écrans", () => {
    expect(rendu([ligne("65")],false)).toContain("Total TTC : 0,00 €");
  });
});
